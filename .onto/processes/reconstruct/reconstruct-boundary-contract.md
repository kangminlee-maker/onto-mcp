# Reconstruct Boundary Contract

> Status: design contract with bounded happy-path runtime and post-Seed loop target.
> Purpose: define how `reconstruct` should be reintroduced without reviving the
> retired runtime ontology generator path.

## 1. Position

`reconstruct` is a host-LLM-led ontology reconstruction process with
deterministic runtime gates. It is not a runtime ontology generator.

`reconstruct` is material-aware from the start. A reconstruction target may be
code, a spreadsheet, a document, a database, a mixed bundle, or an unsupported
material. The process must classify the target's `target_material_kind` before
choosing observation, parsing, validation, or adapter behavior.

The shared goal contract for this axis is
`.onto/processes/shared/target-material-kind-contract.md`.

The active full product runtime remains `review`. `reconstruct` now has a
bounded MCP surface for source profile listing, source observation, directive
validation, post-Seed mock execution, status, and result reads. The runtime path
is not a general ontology generator: it requires pluggable LLM-owned directive
authors and confirmation providers for Seed content, claim realization,
competency questions, assessments, failure classifications, revision proposals,
stop decisions, and final output.

Retired material stays retired:

| Retired surface | Current status |
|---|---|
| `development-records/archive/retired-processes-20260526/processes/reconstruct.md` | historical integral-exploration process |
| `development-records/archive/retired-runtime-legacy-20260526/explorers/` | historical explorer profiles |
| `src/core-runtime/evolve/commands/reconstruct.ts` | retired placeholder path that wrote `ontology-draft.md` |

The current design seat is:

```text
.onto/processes/reconstruct/reconstruct-boundary-contract.md
.onto/processes/reconstruct/reconstruct-execution-ux-contract.md
.onto/processes/reconstruct/source-profile-contract.md
.onto/processes/reconstruct/source-profiles/
.onto/processes/shared/pipeline-execution-ledger-contract.md
```

The planned implementation seat is:

```text
src/core-runtime/reconstruct/
src/core-api/reconstruct-api.ts
src/mcp/tool-schemas.ts
src/mcp/server.ts
```

Current runtime helpers under `src/core-runtime/reconstruct/` load source
profiles, write preparation artifacts, validate source-observation boundaries,
validate `SourceObservationDirective` evidence refs, validate
`SeedCandidateDirective` shape plus evidence refs, validate post-Seed artifacts,
compute deterministic metrics, and assemble `reconstruct-record.yaml`. The
runner orchestrates these gates and delegates semantic directives to a pluggable
directive author.

`src/core-api/reconstruct-api.ts` exposes these helpers as a bounded library
facade for MCP tooling. It can prepare reconstruct artifacts, list source
profiles, validate LLM-authored directive files, run the post-Seed mock loop,
assemble records, and read status/result artifacts. It does not author semantic
directives.

Runtime implementation must not start from tool schemas alone. The ready order is:

```text
contract
-> prompt-backed reference path
-> acceptance observation
-> TS runtime replacement
-> MCP exposure
```

This follows the productization rule that implementation must not outrun the
reference path or create a second artifact truth.

## 2. Ownership Boundary

The host LLM owns semantic interpretation and writes structured directives.
Runtime owns deterministic observation, validation, metrics, artifact refs, and
failure reporting.

Runtime must not write or generate:

- Ontology Seed content
- ontology entities, relations, actions, properties, or rules
- competency questions
- failure classifications
- decision logs
- revision proposals
- final ontology drafts

Runtime may return:

- source observations
- source profile metadata
- directive validation reports
- deterministic metrics
- source/artifact refs
- structured failures

Runtime gate failure never triggers automatic semantic repair. The host LLM must
revise the directive and resubmit it.

## 3. Concept Registration Gate

The names below are design-contract concepts. Before any TS runtime type,
artifact field, or MCP schema is introduced, each shared concept must either be
promoted to `.onto/authority/core-lexicon.yaml` or explicitly marked as
design-local in this contract.

Do not introduce a TypeScript type, public artifact field, or MCP field with a
new reconstruct concept name before this gate is closed.

Current concept decisions:

| Name | Decision | Reason |
|---|---|---|
| `target_material_kind` | promoted shared term | Review, reconstruct, and evolve all need a target-material axis that is separate from domain, medium, target input kind, and artifact role. |
| `PipelineExecutionLedger` | promoted shared term | Review, reconstruct, evolve, and later pipelines need the same runtime-owned artifact trust/provenance projection. |
| `source_kind` | not used for material classification | Review already uses `source_kind` for context-source artifacts. Reconstruct must not overload it to mean code/spreadsheet/document/database. |
| `SourceProfile` | reconstruct design-local until runtime attachment | A profile guides observation for one `target_material_kind`; it is not a semantic explorer and not yet an active runtime artifact. |
| `SourceObservation` | reconstruct design-local until runtime attachment | Runtime-produced structural observation with stable ids; not an ontology fact and not legacy `fact_type`. |
| `SourceAdapter` | implementation boundary | Adapter identity may appear in artifacts later, but it is not an entity. |
| `ReconstructDirective` | schema/union name | LLM-authored directive envelope, not an entity. |
| `SeedConfirmation` | reconstruct design-local | User/host-mediated confirmation artifact for a Seed candidate; not a semantic concept by itself. |
| `CompetencyQuestion` | reconstruct design-local | LLM-authored question artifact used to test a confirmed Seed against its declared purpose. |
| `ClaimRealization` | reconstruct design-local | Claim-level stance about whether a Seed claim is observed behavior, declared intent, contract presence, fixture-only evidence, deferred/non-goal, or unknown. |
| `CompetencyQuestionAssessment` | reconstruct design-local | LLM-authored assessment of every authoritative competency question against the confirmed Seed and evidence. |
| `FailureClassification` | reconstruct design-local | LLM-authored explanation of why a competency question or claim cannot be trusted for the declared purpose. |
| `RevisionProposal` | reconstruct design-local | LLM-authored bounded proposal to reuse, extend, rename, split, reject, or defer ontology content. |
| `ReconstructMetrics` | reconstruct design-local | Runtime projection from existing artifacts; counts and pass rates, not a quality judgment. |
| `StopDecision` | reconstruct design-local | LLM-authored directive that interprets metrics for the declared purpose. |
| `ReconstructRunManifest` | reconstruct design-local | Runtime execution manifest for the reconstruct mock path. |
| `FinalOutput` | shared artifact role, reconstruct-local seat | Human-readable result text grounded in reconstruct artifacts; not an ontology draft authority. |
| `ReconstructStageId` | reconstruct design-local | Stable append-only stage identifier for progress, manifests, status reads, and implementation planning. |
| `RuntimeGate` | design shorthand only | Runtime implementation should use specific validators, boundary policy, and failure artifacts instead of a generic public concept. |
| `DomainContextPack` | design shorthand only | Use selected domain-document refs from invocation/binding rather than creating a new domain context entity. |

## 4. Core Concepts

| Concept | Meaning | Owner |
|---|---|---|
| `TargetMaterialKind` | Shared runtime axis for how the target must be read or validated: `code`, `spreadsheet`, `document`, `database`, `mixed`, or `unknown` | `.onto/authority/core-lexicon.yaml` |
| `OntologySeed` | Smallest evidence-backed execution meaning contract confirmed by the user | LLM authored, user confirmed |
| `SourceProfile` | Reconstruct-local observation profile for one `target_material_kind` | `.onto/processes/reconstruct/source-profiles/` |
| `SourceAdapter` | Runtime observer that returns material structure without ontology meaning | TS runtime |
| `SourceObservation` | Runtime-produced structural fact about paths, cells, formulas, schemas, headings, symbols, or code patterns | TS runtime |
| `ReconstructDirective` | LLM-authored structured output submitted to a runtime gate | host LLM |
| `SeedConfirmation` | User/host-mediated decision over the Seed candidate before downstream questions and metrics | user/host mediated |
| `ClaimRealization` | Claim-level evidence stance used to separate observed runtime behavior from declared design intent, schema presence, fixture-only evidence, deferred scope, and unknowns | host LLM |
| `CompetencyQuestion` | Authoritative question set used to test the confirmed Seed for its declared purpose | host LLM |
| `CompetencyQuestionAssessment` | Answer status and evidence basis for every authoritative competency question | host LLM |
| `FailureClassification` | Cause classification for unanswered, contradicted, unsupported, or deferred questions and claims | host LLM |
| `RevisionProposal` | Bounded change proposal derived from failures and claim realization gaps | host LLM |
| `ReconstructMetrics` | Deterministic projection from validation, confirmation, and question artifacts | TS runtime |
| `ReconstructRunManifest` | Step and artifact-ref manifest for the bounded mock path | TS runtime |
| `PipelineExecutionLedger` | Shared trust/provenance projection over reconstruct stages, validations, outputs, and upstream/downstream boundaries | TS runtime |
| `RuntimeGate` | Design shorthand for shape, source existence, evidence ref, and metric validation | TS runtime |
| `DomainContextPack` | Design shorthand for domain documents selected by invocation/binding | `.onto/domains/` plus invocation binding |

The domain axis and material axis must not be collapsed:

| Axis | Example values | Question answered |
|---|---|---|
| `domain` | accounting, software-engineering, legal, product | What is the target about? |
| `target_material_kind` | code, spreadsheet, document, database, mixed | How must the target be read and validated? |
| `target_input_kind` | single_file, directory, explicit_bundle, git_diff | How did the target enter the runtime? |
| `artifact_roles` | data_artifact, contract_artifact, computational_artifact | What responsibility does the artifact carry in the current run? |

## 5. MCP Tools

Initial bounded tools are exposed through `src/core-api/reconstruct-api.ts`.

| Tool | Status | Runtime responsibility | Explicit non-responsibility |
|---|---|---|---|
| `onto.list_source_profiles` | active | list source profiles, target material kinds, scan targets, and support status | choose ontology meaning |
| `onto.observe_source` | active | materialize target profile, inventory, source observations, and initial reconstruct record | infer entities, relations, actions, properties, or rules |
| `onto.validate_reconstruct_directive` | active | validate LLM-authored source-observation or Seed-candidate directive shape and evidence refs | repair or rewrite the directive |
| `onto.reconstruct` | active | orchestrate the bounded post-Seed mock loop from target refs and intent to final output, run manifest, and reconstruct record; requires explicit mock semantic/confirmation realization until live providers exist | author ontology meaning |
| `onto.reconstruct_status` | active | read `reconstruct-record.yaml` stage and artifact refs | infer missing semantic content |
| `onto.reconstruct_result` | active | read record, run manifest, and final output text | rewrite or improve the result |

MCP remains a thin tool surface. It must expose bounded runtime facts and prompt
inputs for host presentation; it must not become a second reconstruct semantics
implementation.

Current `onto.reconstruct` calls must explicitly set
`semanticAuthorRealization=mock` and `confirmationProviderRealization=mock`.
The run manifest records both realization values. A completed mock run proves the
runtime gates and artifact path, not live host-LLM semantic authorship or
user-mediated confirmation.

## 6. Invocation And Boundary Prelude

Every reconstruct run starts with the same entrypoint split used by review:

1. `InvocationInterpretation`: the host LLM interprets the natural-language
   request into target candidates, target material candidates, intended outcome,
   and ambiguity.
2. `InvocationBinding`: runtime binds the interpreted request into canonical
   target refs, filesystem or connection boundaries, write policy, and source
   profile candidates.

Only after binding is complete may target material profiling and source
inventory begin. Runtime may use deterministic evidence to set
`target_material_kind` to `unknown` rather than guessing. This keeps reconstruct
aligned with the existing invocation convention and prevents source adapters
from expanding their own boundary.

## 7. Canonical Flow

```text
0. InvocationInterpretation and InvocationBinding
1. Target material profiling
2. Source inventory
3. Source observation through material-specific SourceAdapter
4. LLM writes SourceObservationDirective
5. Runtime validates observation directive
6. LLM selects domain-document context refs
7. Runtime validates domain-context selection and source snapshot refs
8. LLM writes SeedCandidateDirective
9. Runtime validates Seed evidence and shape
10. LLM writes ClaimRealizationDirective
11. Runtime validates claim realization refs and stance enums
12. User or host confirms Seed claims at claim level
13. Runtime validates confirmation transitions and derived claim sets
14. LLM writes authoritative competency questions
15. Runtime validates competency question ids, claim links, and evidence refs
16. LLM assesses every authoritative competency question
17. Runtime validates question assessment completeness and refs
18. LLM classifies material failures and unresolved gaps
19. Runtime validates failure classifications and linkage
20. LLM proposes bounded revisions or deferrals
21. Runtime validates revision proposal ids, targets, and actions
22. Runtime computes deterministic metrics from artifacts
23. LLM writes StopDecisionDirective
24. LLM writes final decision-ready output grounded in artifact refs
25. User confirms final ontology direction if needed
```

This flow intentionally uses the review product pattern: LLM-authored meaning,
runtime-owned gates, explicit artifacts, and user-facing decision points.

### 7.1 Stage Registry And Evolution Rules

`ReconstructStageId` values are stable and append-only. Status, progress
presentation, run manifest steps, and future continuation logic must use these
ids rather than prose labels.

| Stage id | Required artifact boundary | Owner |
|---|---|---|
| `invocation_binding` | interpretation and binding refs | host LLM plus runtime |
| `target_material_profile` | `target-material-profile.yaml` | runtime |
| `source_inventory` | `source-inventory.yaml` | runtime |
| `source_observation` | `source-observations.yaml` | runtime |
| `observation_directive` | `source-observation-directive.yaml` | host LLM |
| `observation_directive_validation` | `source-observation-directive-validation.yaml` | runtime |
| `domain_context_selection` | `domain-context-selection.yaml` | host LLM |
| `domain_context_selection_validation` | `domain-context-selection-validation.yaml` | runtime |
| `seed_candidate` | `seed-candidate.yaml` | host LLM |
| `seed_candidate_validation` | `seed-candidate-validation.yaml` | runtime |
| `claim_realization` | `claim-realization-map.yaml` | host LLM |
| `claim_realization_validation` | `claim-realization-map-validation.yaml` | runtime |
| `seed_confirmation` | `seed-confirmation.yaml` | user/host mediated |
| `seed_confirmation_validation` | `seed-confirmation-validation.yaml` | runtime |
| `competency_questions` | `competency-questions.yaml` | host LLM |
| `competency_questions_validation` | `competency-questions-validation.yaml` | runtime |
| `competency_question_assessment` | `competency-question-assessment.yaml` | host LLM |
| `competency_question_assessment_validation` | `competency-question-assessment-validation.yaml` | runtime |
| `failure_classification` | `failure-classification.yaml` | host LLM |
| `failure_classification_validation` | `failure-classification-validation.yaml` | runtime |
| `revision_proposal` | `revision-proposal.yaml` | host LLM |
| `revision_proposal_validation` | `revision-proposal-validation.yaml` | runtime |
| `metrics` | `reconstruct-metrics.yaml` | runtime |
| `stop_decision` | `stop-decision.yaml` | host LLM |
| `final_output` | `final-output.md` | host LLM |
| `record_assembly` | `reconstruct-record.yaml` and `reconstruct-run-manifest.yaml` | runtime |

Rules:

- Existing stage ids must not be renamed after runtime exposure.
- Optional stages must be recorded as `skipped` with a reason, not omitted from
  the manifest.
- Terminal halted stages must keep already-produced artifacts immutable unless a
  future explicit continuation contract says otherwise.
- New stages may be appended between semantic phases only when their input and
  output artifact authority is explicit.

### 7.2 Pipeline Execution Unit Ledger

Reconstruct must map every `ReconstructStageId` into the shared
`PipelineExecutionLedger` contract. The ledger verifies artifact trust and
provenance for both runtime-owned and LLM-authored stages.

Rules:

- Runtime validation stages are trust gates for LLM-authored artifacts.
- An LLM-authored artifact may exist while its `trustStatus` remains
  `untrusted` until the corresponding validation stage completes.
- A downstream stage is `blocked_by_upstream` if any required source artifact is
  missing, failed validation, or belongs to an untrusted producing stage.
- `reconstruct_status` should expose the ledger, or a bounded projection of it,
  so callers can see which artifacts are trustworthy and where the pipeline
  halted.
- Future reconstruct continuation must derive its frontier from this ledger, not
  from ad hoc file existence.

The shared contract is
`.onto/processes/shared/pipeline-execution-ledger-contract.md`.

### 7.3 Identifier Authority

Every cross-artifact reference must point back to one authority artifact. Derived
views may expose ids, but must not become a second source of truth.

| Id family | Authority artifact |
|---|---|
| source observation ids | `source-observations.yaml` |
| selected observation ids | `source-observation-directive.yaml` |
| domain context ids and `domain_snapshot_id` | `domain-context-selection.yaml` |
| Seed claim ids | `seed-candidate.yaml` |
| claim realization ids | `claim-realization-map.yaml` |
| confirmation-derived claim sets | `seed-confirmation-validation.yaml` |
| competency question ids | `competency-questions.yaml` |
| competency question result ids | `competency-question-assessment.yaml` |
| failure ids | `failure-classification.yaml` |
| proposal ids | `revision-proposal.yaml` |

### 7.4 Claim Realization Stances

`claim-realization-map.yaml` must classify every Seed claim with one of these
stances:

| Stance | Meaning |
|---|---|
| `observed_runtime_behavior` | The claim is supported by observed behavior in the target material. |
| `declared_design_intent` | The claim is stated as design or product intent, but runtime behavior is not directly observed. |
| `schema_or_contract_presence` | The claim is supported by a schema, type, contract, config, or interface boundary. |
| `test_or_fixture_only` | The claim is supported only by tests, fixtures, mocks, or examples. |
| `deferred_or_non_goal` | The claim belongs to deferred scope or a declared non-goal. |
| `unknown` | The available artifacts do not justify a stronger stance. |

### 7.5 Claim Confirmation State Rules

Seed confirmation is claim-level. A single run may contain accepted, rejected,
partial, and deferred claims.

| State | Downstream rule |
|---|---|
| `accepted` | Included in the current confirmed Seed set and eligible for competency-question assessment. |
| `rejected` | Excluded from the confirmed Seed set and ineligible except for questions about rejection rationale. |
| `partial` | Excluded from the accepted claim set unless validated accepted sub-claim ids exist; unresolved count increases. |
| `deferred` | Excluded from current competency-question eligibility unless the question explicitly targets deferred scope; deferred and unresolved counts increase. |

`seed-confirmation-validation.yaml` owns the derived sets:

- `accepted_claim_ids`
- `rejected_claim_ids`
- `partial_claim_ids`
- `deferred_claim_ids`
- `cq_eligible_claim_ids`

### 7.6 Competency Question Authority

`competency-questions.yaml` is the authoritative competency-question set for a
run. It is authored after Seed confirmation so that questions test the confirmed
Seed and declared purpose, not a discarded draft.

`competency-question-assessment.yaml` must assess every authoritative question
exactly once. Domain-provided question templates are not in-scope unless
`domain-context-selection.yaml` explicitly admits them into the run.

## 8. Prompt-Backed Reference Path

Before runtime replacement, reconstruct needs at least one prompt-backed
reference run that follows this contract and produces the same artifact shapes
planned for the runtime path.

The reference run may be host-LLM-authored, but it must preserve:

- the same invocation/binding prelude
- the same directive names
- the same artifact seats
- the same evidence-ref discipline
- the same runtime/non-runtime ownership boundary
- an acceptance observation describing usefulness, missing evidence, and drift

Runtime implementation may replace only one deterministic boundary at a time:
source profile loading, source observation, directive validation, metric
calculation, then MCP exposure.

## 9. Meaning Directives And Runtime Gates

| Directive | Purpose | Runtime gate |
|---|---|---|
| `SourceObservationDirective` | choose which runtime observations are evidence candidates | observation id, material kind, source ref, and location validation |
| `DomainContextSelectionDirective` | choose domain documents and explain why | context existence, scope, and `domain_snapshot_id` validation |
| `SeedCandidateDirective` | propose purpose, non-goals, entities, relations, actions, properties, and rules | schema shape, prior observation-directive status, selected observation, and evidence ref validation |
| `ClaimRealizationDirective` | classify each Seed claim's evidence stance | claim id, stance enum, source/evidence ref, and rationale presence validation |
| `EvidenceMapDirective` | connect claims to evidence | dangling ref and duplicate evidence checks |
| `SeedConfirmationDirective` | record claim-level accepted, rejected, partial, or deferred confirmation | state transition, duplicate claim, missing claim, and derived-set validation |
| `CompetencyQuestionDirective` | define the authoritative execution question set and scope boundaries | duplicate id, closed question set, claim linkage, and evidence-ref validation |
| `CompetencyQuestionAssessmentDirective` | answer or mark every authoritative question | exactly-once question coverage, answer-state enum, claim linkage, and evidence-ref validation |
| `FailureClassificationDirective` | classify why a question or claim cannot be trusted for the declared purpose | enum, question/result linkage, claim linkage, and materiality rationale checks |
| `OntologyRevisionProposal` | propose reuse, extend, rename, split, reject, or defer decisions | proposal id, target id, action enum, schema, and regression checks |
| `StopDecisionDirective` | decide continue, stop, or ask user based on metrics and purpose | metrics presence and enum validation |
| `FinalOutputDirective` | present decision-ready user-facing output | artifact provenance, section presence, and unresolved/deferred disclosure checks |

Every semantic claim in a Seed or revision proposal needs evidence refs. A claim
without evidence remains a hypothesis or open question.

## 10. Artifact Truth

The reconstruct session should write artifacts under a dedicated session root,
following the review convention that primary truth lives in artifacts and MCP
returns bounded refs.

Current and provisional artifact contract:

| Artifact | Owner | Status | Purpose |
|---|---|---|---|
| `target-material-profile.yaml` | runtime | helper implemented | selected target material kind, candidates, confidence, selected source profiles, and unsupported-material status |
| `source-inventory.yaml` | runtime | helper implemented | selected source roots, material-specific inventory units, and scan boundaries |
| `source-observations.yaml` | runtime | helper implemented | adapter id, material kind, location, structural data, and stable observation ids |
| `source-observation-directive.yaml` | LLM | implemented through pluggable author | selected observations and evidence-candidate rationale |
| `source-observation-directive-validation.yaml` | runtime | helper implemented | validation status and violations for LLM-selected observation refs |
| `domain-context-selection.yaml` | LLM | future | chosen domain context refs and rationale |
| `domain-context-selection-validation.yaml` | runtime | future | context existence, scope, and snapshot validation |
| `seed-candidate.yaml` | LLM | implemented through pluggable author | proposed Ontology Seed before user confirmation |
| `seed-candidate-validation.yaml` | runtime | helper implemented | validation status and violations for LLM-authored Seed claim shape and observation evidence refs |
| `claim-realization-map.yaml` | LLM | mock loop implemented through pluggable author | evidence stance for every Seed claim |
| `claim-realization-map-validation.yaml` | runtime | implemented | claim id, stance enum, and evidence linkage validation |
| `seed-confirmation.yaml` | user/host mediated | mock loop implemented through pluggable provider | claim-level accepted, rejected, partial, or deferred Seed decisions |
| `seed-confirmation-validation.yaml` | runtime | implemented | confirmation transition validation and derived claim sets |
| `competency-questions.yaml` | LLM | implemented through pluggable author | authoritative execution questions and boundaries |
| `competency-questions-validation.yaml` | runtime | implemented | closed CQ set, duplicate id, claim-link, and evidence validation |
| `competency-question-assessment.yaml` | LLM | mock loop implemented through pluggable author | answer status and evidence basis for every authoritative question |
| `competency-question-assessment-validation.yaml` | runtime | implemented | exactly-once coverage, status enum, and evidence validation |
| `failure-classification.yaml` | LLM | mock loop implemented through pluggable author | failed or unsafe-to-trust question and claim causes |
| `failure-classification-validation.yaml` | runtime | implemented | failure enum, linkage, and materiality rationale validation |
| `revision-proposal.yaml` | LLM | mock loop implemented through pluggable author | bounded ontology changes, deferrals, or rejection proposals |
| `revision-proposal-validation.yaml` | runtime | implemented | proposal id, target id, action enum, and regression guard validation |
| `reconstruct-metrics.yaml` | runtime | implemented | deterministic counts and pass rates |
| `stop-decision.yaml` | LLM | implemented through pluggable author | continue, stop, or ask-user judgment |
| `final-output.md` | LLM | implemented through pluggable author and provenance-checked by runtime | user-facing result text grounded in artifacts |
| `reconstruct-run-manifest.yaml` | runtime assembly | implemented | step list, owner boundary, performed-by provenance, happy-path scope, artifact refs, and execution profile |
| `reconstruct-record.yaml` | runtime assembly | helper implemented, primary artifact in mock loop | primary structured reconstruct artifact with material, validation, and artifact refs |

These artifact names are provisional but contract-owned. Runtime implementation
must either implement this contract or update this contract before code lands.
Runtime code must not silently fix a different schema.

The current mock runtime path explicitly implements:

- target material profile, inventory, and source observations
- source-observation directive plus validation
- Seed candidate plus validation
- claim realization plus validation
- Seed confirmation through an explicit mock confirmation provider
- Seed confirmation validation and derived claim sets
- competency questions through an explicit mock directive author
- competency-question validation and assessment
- failure classification plus validation
- revision proposal plus validation
- deterministic reconstruct metrics
- stop decision and provenance-checked final output through an explicit mock directive author
- reconstruct run manifest and primary reconstruct record

The current mock runtime path explicitly defers:

- `domain-context-selection.yaml`
- `domain-context-selection-validation.yaml`

These deferred artifacts require additional host/user semantic decisions and
must not be implied by a completed mock run.

`reconstruct-record.yaml` is the primary artifact for the mock path in the same
way `review-record.yaml` is primary for review.

## 11. Completion Rule

Runtime computes, but does not decide:

- evidence ref count
- Seed concept count
- claim realization stance counts
- confirmation state counts and derived claim-set counts
- competency question count
- competency question assessment status counts
- failed question count
- failure classification counts
- proposed revision count
- unresolved count
- pass rate
- new concept rate
- duplicate candidate count
- regression failure count

The host LLM compares these metrics against the declared execution purpose and
writes a `StopDecisionDirective` with `continue`, `stop`, or `ask_user`.

The user-facing result should separate:

- confirmed Seed content
- claim realization summary
- competency question assessment summary
- failure classifications
- revision proposals or deferrals
- unresolved material questions
- unsupported or out-of-scope requests
- proposed next actions
- artifact provenance for the claims, questions, failures, proposals, and stop
  rationale it mentions

`final-output.md` is decision-ready prose, not a new truth source. Any claim it
presents as confirmed, unresolved, failed, deferred, or proposed must point back
to the artifact id family that owns that state.

## 12. Runtime Implementation Readiness

Runtime attachment is ready only when all of these are true:

1. Shared concept names are registered or explicitly scoped as design-local.
2. A prompt-backed reference run has produced the provisional artifact set.
3. The source profile loader has a fixed path under
   `.onto/processes/reconstruct/source-profiles/`.
4. `target_material_kind` is recorded before source adapter selection.
5. Source adapter output has stable observation ids and boundary failure rules.
6. Directive validation has schemas for every meaning directive it accepts.
7. Metrics are defined as deterministic projections from existing artifacts.
8. MCP schemas expose only bounded facts and artifact refs.
9. Stage ids are stable and recorded in status, run manifest, and records.
10. Cross-artifact id authority is explicit and validators reject dangling refs.
11. Final output provenance is validated against artifact ids rather than prose.

## 13. Verification Target

When the implementation starts, use at least:

```bash
npm run check:ts-core
npx vitest run src/core-runtime/reconstruct
npx vitest run src/core-api/reconstruct-api.test.ts
npm run test:mcp:review
git diff --check
```

`test:mcp:review` remains review-focused, but it protects the shared MCP server
from regressions when reconstruct tools are introduced.

The first end-to-end fixture may use the `day1co/day1co-ai-usage-dashboard`
repository or an equivalent temporary fixture. An equivalent fixture must cover:

- multiple selected source observations
- at least five Seed claims
- at least one accepted claim and one rejected, partial, or deferred claim
- at least one competency question that is not fully answered
- at least one failure classification
- at least one revision proposal
- final output references back to the owning artifact ids
