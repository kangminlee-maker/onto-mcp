# Reconstruct Actionable Ontology Seed Recomposition Design

> Status: active design plan.
> Purpose: define the complete reconstruct rework path so active runtime
> prompts, contracts, validation, and result UX converge on an actionable
> ontology seed.

## 1. Goal

Reconstruct should produce a seed that can support later decisions and actions.

The target output is `ontology-seed.yaml`, an `ActionableOntologySeed` that
contains:

- why the target exists
- what operational objects exist
- which actors participate
- what actions can happen
- what workflows or state transitions matter
- which permission or policy rules control action
- which source data backs, reads, writes, or proves the seed
- which external competency-question artifact tests the seed
- which limitations must be carried into the next step

The seed is complete enough when it can be handed to review, evolve, product
design, implementation planning, or user-facing explanation without pretending
that missing actors, actions, permissions, or data bindings are known.

## 2. Non-Negotiable Constraints

1. Runtime validates; the host LLM authors semantic meaning.
2. Active reconstruct prompts and contracts load only the active reconstruct
   contract set.
3. Source material kind is classified before observation and validation.
4. Conceptual orientation is only one layer of the seed.
5. Salient candidates must receive explicit disposition.
6. Seed validity is separate from process completion.
7. Partial results may be useful, but limitations must be explicit.
8. `reconstruct-contract-registry.yaml` is the canonical machine-readable
   authority graph for active runtime artifacts, validation gates, result
   projections, source profile records, and reconstruct lens judgment records.

## 3. Active Concept Model

| Concept | Role | Owner |
|---|---|---|
| `ActionableOntologySeed` | primary reconstruct semantic artifact | host LLM authored, runtime validated |
| `TargetMaterialKind` | source handling axis | shared contract |
| `SourceProfileDefinition` | material-specific observation guide | reconstruct contract |
| `SelectedSourceProfile` | runtime selection recorded after material classification | runtime |
| `SourceObservation` | structural evidence record | runtime |
| `ReconstructLensJudgment` | independent semantic judgment over observed evidence | host LLM |
| `ExplorationSynthesis` | integrated round result and next-source need | host LLM |
| `SourceFrontier` | requested next source refs | host LLM authored, runtime validated |
| `CandidateInventory` | salient candidate set found in evidence | host LLM |
| `CandidateDisposition` | placement decision for every salient candidate | host LLM |
| `CompetencyQuestion` | question used to test seed usefulness | host LLM |
| `TerminalHandoffReadinessValidation` | runtime gate projection for declared downstream use | runtime |
| `ReconstructRecord` | structured run record and artifact truth index | runtime |

New runtime or MCP fields should reuse these concepts. A new concept is allowed
only when it changes ownership, lifecycle, validation behavior, public output,
or artifact authority.

## 4. Target Process

```text
1. Bind target and purpose
2. Classify material kind
3. Build source inventory
4. Observe selected source slices
5. Select evidence for semantic use
6. Run reconstruct lens judgments
7. Synthesize gaps and next-source frontier
8. Repeat observation with round lineage if frontier is valid and useful
9. Build candidate inventory
10. Record candidate disposition
11. Author ActionableOntologySeed
12. Validate seed-shape gates
13. Author claim-realization map
14. Validate claim-realization map
15. Confirm seed claims or record limitations
16. Validate seed confirmation and derive CQ eligibility
17. Author competency questions
18. Validate competency-question coverage
19. Assess competency questions
20. Validate competency-question assessment
21. Classify failures and propose bounded revision
22. Emit metrics and stop decision
23. Validate terminal handoff readiness from runtime gates and stop decision
24. Emit final output and reconstruct record
```

Each step either writes an artifact or records why it cannot proceed.

## 5. Exploration Strategy

Exploration should look for missing actionable layers, not just missing
orientation concepts.

The next source frontier should prefer source refs that may change:

- object identity or object boundaries
- actor roles and principals
- available actions
- workflow or state transition understanding
- permission or policy treatment
- data source, read model, write target, or provenance treatment
- competency-question answerability
- handoff limitation severity

The frontier should not request more source only to add detail that cannot
change seed validity for the declared purpose.

Each repeated observation must be traceable. Runtime records an
`observation_batch_id`, `round_id`, and `triggering_frontier_ref` on new
observation records, and writes a round-scoped observation delta artifact before
new evidence can enter the next directive, lens judgment, synthesis, or
candidate finalization step.

The delta artifact is lineage evidence, not gate truth. Runtime must also write
`rounds/<round-id>/source-observation-delta-validation.yaml` to prove the
pre-use lineage check passed or failed. Frontier validation authorizes what may
be observed; delta validation proves what was actually observed and how it is
tied to the round/frontier before downstream semantic use.

`source_frontier_gate` must validate duplicate status against current
`source-observations.yaml`, not only against the source inventory. The
`observation_reentry_gate` is the only gate that validates downstream re-entry
from declared authority refs: lens judgments, exploration synthesis,
candidate inventory/disposition, and seed validation artifacts.

## 6. Candidate Strategy

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

## 7. Seed Validity Strategy

Process completion means the run reached an end state and wrote records.

Seed validity means the authored seed and downstream validation artifacts pass
the gates needed for the declared downstream purpose.

Validation is lifecycle-scoped. A seed-shape validation artifact may not claim
final seed validity before seed confirmation, competency-question, assessment,
and handoff validation artifacts exist.

The complete gate and validation-artifact catalog is registry-owned at
`reconstruct-contract-registry.yaml#validation_gate_catalog`,
`#validator_records`, and `#readiness_projection.handoff_validation_policy`.
This design document names gate families only: material profile, source evidence
and frontier lineage, candidate disposition, seed layer and connectivity,
competency questions and assessment, seed confirmation, conditional query,
visualization and graph-exploration proofs, failure/revision handling, run
manifest validation, and terminal handoff validation.

`seed_confirmation_gate` is lifecycle-required whenever seed validity or handoff
readiness is projected. If `seed-confirmation.yaml` or
`seed-confirmation-validation.yaml` is absent at that lifecycle point, runtime
must project `blocked`. A limitation state is allowed only when both
`seed-confirmation.yaml` and `seed-confirmation-validation.yaml` exist and the
validation artifact proves the limitation state against the validated seed and
derives CQ eligibility. Assessment-aware readiness is evaluated by
`handoff-decision-validation.yaml`.
`handoff-decision-validation.yaml` must validate against the validation-result
authorities that contribute to readiness, including
`reconstruct-run-manifest.pre-handoff-validation.yaml`; it may not rely only on raw authored
artifacts, unvalidated run manifests, or record projections.
The set of contributing validation artifacts is condition-aware. Runtime derives
applicability from each gate's `required_when`: missing required-and-applicable
validation artifacts project `blocked`, while unmet conditional paths project
`not_applicable` and do not block a clean run.
Each `required_when` predicate is evaluated from the registry-owned predicate
catalog, which names input artifact refs, field-level truth expressions, unknown
projection, and the explanation template for status/result surfaces.
If an active gate names a predicate expression that the runtime evaluator does
not support, runtime treats that gate as unknown and fails the handoff closed
until the evaluator is implemented. Unsupported active predicates must not
silently project `not_applicable`.
Terminal `handoff-decision-validation.yaml` is produced by `handoff_gate`.
`final-output.md` and `reconstruct-record.yaml` are emitted only after
`handoff-decision-validation.yaml` passes; they are projections from the
validated terminal readiness result, not inputs to the terminal readiness validator.
`final-output-provenance-validation.yaml` validates the post-handoff user-facing
projection. It is not a readiness gate for `handoff-decision-validation.yaml`.

The canonical readiness projection must distinguish:

- ready for the declared downstream purpose
- usable with named limitations
- not ready because required seed validity gates failed
- blocked because source or user confirmation is missing

Artifact-specific readiness fields may use local names, but status/result APIs
and final output must project one canonical readiness value:
`ready`, `limited`, `not_ready`, or `blocked`.

## 8. Artifact Plan

The complete target artifact list is registry-owned at
`reconstruct-contract-registry.yaml#artifact_authorities`. This plan groups the
artifact families as preparation/observation, round exploration,
candidate/disposition, seed/validation, competency questions and assessment,
confirmation, conditional proof authorities, failure/revision, metrics,
handoff, final output, run manifest, and reconstruct record.

`ontology-seed.yaml` is the seed semantic authority.
`candidate-disposition.yaml` is the disposition authority.
`competency-questions.yaml` is the question authority.
`competency-question-assessment.yaml` is the answerability-result authority.
`reconstruct-contract-registry.yaml` is the active runtime authority graph.
`reconstruct-record.yaml` is the run authority and artifact index; it contains
refs, hashes, validation statuses, and bounded projections only.

## 9. Runtime Validation Plan

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
- lifecycle-required seed confirmation and handoff validation-result authority
  closure
- final-output provenance footer

Runtime may calculate metrics from artifacts, but metrics are not semantic truth.

## 10. Prompt Plan

Prompt packets should give the host LLM:

- declared purpose and target refs
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

## 11. Result UX Plan

The beginning of a run should state:

- target refs
- material kind and profile
- execution profile and provider route, without secrets
- declared purpose and review direction
- expected artifact path

Progress updates should be stepwise:

```text
[1/8] Source classified
[2/8] Source evidence observed
[3/8] Semantic judgments running
[4/8] Candidate disposition built
[5/8] Seed authored
[6/8] Seed-shape validation running
[7/8] Questions, assessment, and handoff validation running
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

## 12. Implementation Sequence

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
- question prompts request `competency-questions.yaml` only after seed-shape
  validation succeeds or records explicit seed limitations
- prompts load only active contracts and compact source evidence
- retry prompts receive validation failures as the repair context

### Stage 4. Runtime Gates

Expected result:

- every validation gate in Section 7 has a deterministic validator
- validation phases are split into seed-shape, question coverage, question
  assessment, confirmation, and handoff validation
- active source-frontier validation records dependency proof on
  `target-material-profile-validation.yaml`; source-observation deltas,
  admission lineage, and post-use re-entry validation remain planned gates until
  their validators are promoted in the registry
- target material profile facts and material profile gate status are separated
  into `target-material-profile.yaml` and `target-material-profile-validation.yaml`
- source frontier validation is represented by `source_frontier_gate`
- seed confirmation validation is represented by `seed_confirmation_gate`
- seed confirmation is required before seed validity or handoff readiness is
  projected; missing confirmation projects `blocked` unless a valid limitation
  state is recorded
- seed-confirmation and handoff validators consume validation-result authorities,
  not only raw authored artifacts or reconstruct-record projections
- handoff validation applies each validation artifact through the registry's
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
- status/result APIs expose failed gates and handoff limitations

### Stage 5. Final Output And Record

Expected result:

- final output presents purpose, layers, trust limits, next action, and artifact
  refs
- `reconstruct-record.yaml` indexes every artifact and validation result
- `handoff-decision-validation.yaml` proves the stop decision and runtime
  readiness projection agree with validation artifacts and the validated
  pre-handoff run-manifest snapshot before final output and record projections
  are emitted
- final output and status/result APIs expose one canonical readiness projection
- seed validity and process completion are reported separately

### Stage 6. E2E Verification

Expected result:

- a real repository run produces `ontology-seed.yaml`
- source refs close against `source-observations.yaml`
- candidate disposition includes salient objects, actors, actions, permissions,
  and data sources
- competency questions and assessments are authored from validated seed refs and
  close through traceable evidence
- round-scoped observation lineage links frontier-triggered observations back
  into lens judgment and synthesis
- run manifest records the registry ref/hash, active contract refs/hashes,
  source profile snapshots and migration mappings, lens ids, validator
  versions, reference authority snapshots, and pattern catalog URI/snapshot
  facts used for the run
- review over the produced seed can evaluate ontology adequacy without needing
  development history
- failures are visible at the first invalid gate

## 13. Completion Definition For This Recomposition

The recomposition is implemented when a fresh reconstruct run against a real
target produces:

1. material-aware source observations,
2. candidate inventory and disposition,
3. `ontology-seed.yaml` using the active seed contract,
4. deterministic validation artifacts for every gate,
5. canonical candidate-disposition, competency-question, assessment, and
   handoff-validation authorities, including diagnostic or claim-based P3
   competency-question disposition when ontology domain competency admission is present,
6. active source-frontier dependency validation, plus promoted pre-use lineage
   and post-use re-entry validation when multi-round validators become active,
7. registry ref/hash plus active contract ref/hash, source profile migration,
   lens judgment, concrete gate-instance, validator, reference-standard,
   pattern-catalog URI/snapshot, and readiness-projection snapshots,
8. separate process-completion and seed-validity reporting,
9. final output that explains actionable seed content, canonical readiness, and
   limitations, and
10. a reconstruct record whose artifact refs are the source of truth.
