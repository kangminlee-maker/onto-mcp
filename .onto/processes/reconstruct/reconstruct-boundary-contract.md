# Reconstruct Boundary Contract

> Status: design contract with bounded happy-path runtime.
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
validation, happy-path execution, status, and result reads. The happy path is
not a general ontology generator: it requires pluggable LLM-owned directive
authors and confirmation providers for Seed content, competency questions, stop
decisions, and final output.

Retired material stays retired:

| Retired surface | Current status |
|---|---|
| `development-records/archive/retired-processes-20260526/processes/reconstruct.md` | historical integral-exploration process |
| `development-records/archive/retired-runtime-legacy-20260526/explorers/` | historical explorer profiles |
| `src/core-runtime/evolve/commands/reconstruct.ts` | retired placeholder path that wrote `ontology-draft.md` |

The current design seat is:

```text
.onto/processes/reconstruct/reconstruct-boundary-contract.md
.onto/processes/reconstruct/source-profile-contract.md
.onto/processes/reconstruct/source-profiles/
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
`SeedCandidateDirective` shape plus evidence refs, compute deterministic
metrics, and assemble `reconstruct-record.yaml`. The happy-path runner
orchestrates these gates and delegates semantic directives to a pluggable
directive author.

`src/core-api/reconstruct-api.ts` exposes these helpers as a bounded library
facade for MCP tooling. It can prepare reconstruct artifacts, list source
profiles, validate LLM-authored directive files, run the happy path, assemble
records, and read status/result artifacts. It does not author semantic
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
| `source_kind` | not used for material classification | Review already uses `source_kind` for context-source artifacts. Reconstruct must not overload it to mean code/spreadsheet/document/database. |
| `SourceProfile` | reconstruct design-local until runtime attachment | A profile guides observation for one `target_material_kind`; it is not a semantic explorer and not yet an active runtime artifact. |
| `SourceObservation` | reconstruct design-local until runtime attachment | Runtime-produced structural observation with stable ids; not an ontology fact and not legacy `fact_type`. |
| `SourceAdapter` | implementation boundary | Adapter identity may appear in artifacts later, but it is not an entity. |
| `ReconstructDirective` | schema/union name | LLM-authored directive envelope, not an entity. |
| `SeedConfirmation` | reconstruct design-local | User/host-mediated confirmation artifact for a Seed candidate; not a semantic concept by itself. |
| `CompetencyQuestion` | reconstruct design-local | LLM-authored question artifact used to test a confirmed Seed against its declared purpose. |
| `ReconstructMetrics` | reconstruct design-local | Runtime projection from existing artifacts; counts and pass rates, not a quality judgment. |
| `StopDecision` | reconstruct design-local | LLM-authored directive that interprets metrics for the declared purpose. |
| `ReconstructRunManifest` | reconstruct design-local | Runtime execution manifest for the reconstruct happy path. |
| `FinalOutput` | shared artifact role, reconstruct-local seat | Human-readable result text grounded in reconstruct artifacts; not an ontology draft authority. |
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
| `ReconstructMetrics` | Deterministic projection from validation, confirmation, and question artifacts | TS runtime |
| `ReconstructRunManifest` | Step and artifact-ref manifest for the bounded happy path | TS runtime |
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
| `onto.reconstruct` | active | orchestrate the bounded happy path from target refs and intent to final output, run manifest, and reconstruct record; requires explicit mock semantic/confirmation realization until live providers exist | author ontology meaning |
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
7. LLM writes SeedCandidateDirective
8. Runtime validates Seed evidence and shape
9. User confirms or rejects Seed candidate
10. LLM writes competency questions
11. Runtime computes question/test metrics
12. LLM classifies failures and proposes revisions
13. Runtime validates revisions and recomputes metrics
14. LLM writes StopDecisionDirective
15. User confirms final ontology direction if needed
```

This flow intentionally uses the review product pattern: LLM-authored meaning,
runtime-owned gates, explicit artifacts, and user-facing decision points.

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

## 9. LLM-Owned Directives

| Directive | Purpose | Runtime gate |
|---|---|---|
| `SourceObservationDirective` | choose which runtime observations are evidence candidates | observation id, material kind, source ref, and location validation |
| `DomainContextSelectionDirective` | choose domain documents and explain why | context existence and scope validation |
| `SeedCandidateDirective` | propose purpose, non-goals, entities, relations, actions, properties, and rules | schema shape, prior observation-directive status, selected observation, and evidence ref validation |
| `EvidenceMapDirective` | connect claims to evidence | dangling ref and duplicate evidence checks |
| `CompetencyQuestionDirective` | define execution questions and scope boundaries | duplicate and coverage metric checks |
| `FailureClassificationDirective` | classify why a question cannot be answered | enum and question/result linkage checks |
| `OntologyRevisionProposal` | propose reuse, extend, rename, split, or reject decisions | id collision, target, schema, and regression checks |
| `StopDecisionDirective` | decide continue, stop, or ask user based on metrics and purpose | metrics presence and enum validation |

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
| `source-observation-directive.yaml` | LLM | happy path implemented through pluggable author | selected observations and evidence-candidate rationale |
| `source-observation-directive-validation.yaml` | runtime | helper implemented | validation status and violations for LLM-selected observation refs |
| `domain-context-selection.yaml` | LLM | future | chosen domain context refs and rationale |
| `seed-candidate.yaml` | LLM | happy path implemented through pluggable author | proposed Ontology Seed before user confirmation |
| `seed-candidate-validation.yaml` | runtime | helper implemented | validation status and violations for LLM-authored Seed claim shape and observation evidence refs |
| `seed-confirmation.yaml` | user/host mediated | happy path implemented through pluggable provider | confirmed, rejected, or partially confirmed Seed decisions |
| `competency-questions.yaml` | LLM | happy path implemented through pluggable author | execution questions and boundaries |
| `failure-classification.yaml` | LLM | future | failed question causes and recommended action |
| `revision-proposal.yaml` | LLM | future | bounded ontology changes |
| `reconstruct-metrics.yaml` | runtime | happy path implemented | deterministic counts and pass rates |
| `stop-decision.yaml` | LLM | happy path implemented through pluggable author | continue, stop, or ask-user judgment |
| `final-output.md` | LLM | happy path implemented through pluggable author | user-facing result text grounded in artifacts |
| `reconstruct-run-manifest.yaml` | runtime assembly | happy path implemented | step list, owner boundary, performed-by provenance, happy-path scope, artifact refs, and execution profile |
| `reconstruct-record.yaml` | runtime assembly | helper implemented, primary artifact in happy path | primary structured reconstruct artifact with material, validation, and artifact refs |

These artifact names are provisional but contract-owned. Runtime implementation
must either implement this contract or update this contract before code lands.
Runtime code must not silently fix a different schema.

The current happy path explicitly implements:

- target material profile, inventory, and source observations
- source-observation directive plus validation
- Seed candidate plus validation
- Seed confirmation through an explicit mock confirmation provider
- competency questions through an explicit mock directive author
- deterministic reconstruct metrics
- stop decision and final output through an explicit mock directive author
- reconstruct run manifest and primary reconstruct record

The current happy path explicitly defers:

- `domain-context-selection.yaml`
- `failure-classification.yaml`
- `revision-proposal.yaml`

These deferred artifacts require additional host/user semantic decisions and
must not be implied by a completed mock happy-path run.

`reconstruct-record.yaml` is the primary artifact for the happy path in the same
way `review-record.yaml` is primary for review.

## 11. Completion Rule

Runtime computes, but does not decide:

- evidence ref count
- Seed concept count
- competency question count
- failed question count
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
- unresolved material questions
- unsupported or out-of-scope requests
- proposed next actions

## 12. Runtime Implementation Readiness

Runtime attachment is ready only when all of these are true:

1. Shared concept names are registered or explicitly scoped as design-local.
2. A prompt-backed reference run has produced the provisional artifact set.
3. The source profile loader has a fixed path under
   `.onto/processes/reconstruct/source-profiles/`.
4. `target_material_kind` is recorded before source adapter selection.
5. Source adapter output has stable observation ids and boundary failure rules.
6. Directive validation has schemas for every LLM-owned directive it accepts.
7. Metrics are defined as deterministic projections from existing artifacts.
8. MCP schemas expose only bounded facts and artifact refs.

## 13. Verification Target

When the implementation starts, use at least:

```bash
npm run check:ts-core
npx vitest run src/core-runtime/reconstruct
npm run test:mcp:review
git diff --check
```

`test:mcp:review` remains review-focused, but it protects the shared MCP server
from regressions when reconstruct tools are introduced.
