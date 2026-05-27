# Reconstruct Post-Seed Artifact Loop Goal

> Status: draft goal for Codex implementation.
> Scope: make the completed `reconstruct` process run beyond Seed creation into
> claim realization, confirmation validation, competency-question assessment,
> failure classification, revision proposal, metrics, stop decision, and final
> artifact-tethered output.

## Objective

Implement the post-Seed artifact loop for `reconstruct` without turning runtime
into an ontology generator.

The completed path should let a host LLM propose meaning while runtime validates
artifact shape, ids, evidence refs, stage order, derived metrics, and final
output provenance.

## Starting Point

Current runtime already supports:

- material profiling and source inventory
- source observations through source profiles
- `SourceObservationDirective` validation
- `SeedCandidateDirective` validation
- mock semantic author and mock confirmation provider
- `seed-confirmation.yaml`, `competency-questions.yaml`,
  `reconstruct-metrics.yaml`, `stop-decision.yaml`, `final-output.md`,
  `reconstruct-run-manifest.yaml`, and `reconstruct-record.yaml`
- MCP/core API prepare, run, status, and result helpers

Current happy path is bounded and mock-authored. It does not yet prove claim
realization, competency-question assessment, failure classification, revision
proposal, or final-output provenance.

## Non-Goals

- Do not build a runtime ontology author.
- Do not add a separate HTML or dashboard implementation.
- Do not optimize only for code targets; keep spreadsheet, document, database,
  mixed, and unknown material kinds as first-class future targets.
- Do not expose a public concept when an internal artifact field or derived view
  is enough.
- Do not implement live provider quality conformance in this goal.

## Invariants

- Runtime owns observation, validation, id authority, metrics, artifact refs,
  stage state, and failure records.
- Host LLM owns semantic directives, candidate meaning, failure explanation,
  revision proposal, stop decision, and final prose.
- User/host confirmation owns accepted, rejected, partial, and deferred Seed
  claim decisions.
- `reconstruct-record.yaml` remains the primary structured artifact.
- `final-output.md` is a projection, not a source of truth.
- `target_material_kind` is selected before adapter behavior.
- Stage ids are stable and append-only after exposure.

## Implementation Phases

### Phase 1 - Contract Alignment

Expected result:

- `.onto/processes/reconstruct/reconstruct-boundary-contract.md` defines the
  post-Seed stages, artifact set, id authorities, claim realization stances,
  confirmation states, and CQ authority.
- `.onto/processes/reconstruct/reconstruct-execution-ux-contract.md` defines
  opening, progress, decision-point, final, and halted-run presentation.

Done when:

- active docs name all post-Seed artifacts and runtime gates
- `AGENTS.md`, `README.md`, and `IMPLEMENTATION_MAP.html` point to the current
  reconstruct contract set
- doc verification passes with no broken local links or trailing whitespace

### Phase 2 - Types And Artifact Registry

Expected result:

- TypeScript has explicit artifact types for:
  `claim-realization-map.yaml`,
  `claim-realization-map-validation.yaml`,
  `seed-confirmation-validation.yaml`,
  `competency-questions-validation.yaml`,
  `competency-question-assessment.yaml`,
  `competency-question-assessment-validation.yaml`,
  `failure-classification.yaml`,
  `failure-classification-validation.yaml`,
  `revision-proposal.yaml`, and
  `revision-proposal-validation.yaml`.
- A stable `ReconstructStageId` registry feeds run manifest, status, and record
  assembly.
- Existing happy-path artifacts remain backward compatible.

Done when:

- TypeScript compile passes
- existing reconstruct tests pass unchanged or with additive fixture updates
- every new artifact has one canonical read/write seat

### Phase 3 - Runtime Validators

Expected result:

- Runtime validators reject dangling refs, duplicate ids, invalid enums, missing
  required coverage, and output/provenance drift.
- Runtime derives confirmation sets from `seed-confirmation.yaml` into
  `seed-confirmation-validation.yaml`.
- Runtime validates every authoritative competency question is assessed exactly
  once.

Done when:

- validator tests cover valid, missing-ref, duplicate-id, invalid-enum,
  incomplete-coverage, and stale-artifact cases
- runtime never repairs semantic content automatically
- validation failures produce structured failure records or validation artifacts

### Phase 4 - Metrics, Record, And Status Projection

Expected result:

- `reconstruct-metrics.yaml` includes claim realization stance counts,
  confirmation state counts, CQ assessment counts, failure classification counts,
  proposal action counts, unresolved count, deferred count, and pass rate.
- `reconstruct-record.yaml` references all produced post-Seed artifacts.
- `reconstruct_status` exposes stage state, artifact refs, liveness, and compact
  progress facts.

Done when:

- metrics are deterministic projections from artifacts
- status/result reads do not infer missing semantic content
- halted and skipped stages are visible without implying completion

### Phase 5 - Core API And MCP Surface

Expected result:

- Core API can run the extended mock path and read the extended result.
- MCP status/result expose bounded facts and artifact refs needed by the UX
  contract.
- Public tool schemas do not expose internal helper concepts as product terms.

Done when:

- MCP conformance tests cover extended status/result shape
- security disclosure and project-boundary checks still pass
- mock realization values are explicit in the manifest

### Phase 6 - Mock Runner Extension

Expected result:

- The mock semantic author emits deterministic artifacts for claim realization,
  competency-question assessment, failure classification, revision proposal, stop
  decision, and final output.
- The mock confirmation provider emits mixed claim states so downstream gates are
  exercised.

Done when:

- fixture run produces all post-Seed artifacts
- final output cites artifact ids for confirmed claims, unanswered questions,
  failures, revisions, and stop rationale
- no semantic artifact is produced by runtime code

### Phase 7 - End-To-End Fixture Verification

Expected result:

- A fixture run proves the whole artifact loop against
  `day1co/day1co-ai-usage-dashboard` or an equivalent local fixture.

Equivalent fixture criteria:

- multiple selected source observations
- at least five Seed claims
- at least one accepted claim
- at least one rejected, partial, or deferred claim
- at least one competency question that is not fully answered
- at least one failure classification
- at least one revision proposal
- final output references owning artifact ids

Done when:

- `reconstruct-record.yaml` is complete and validates
- `reconstruct_result` returns final output plus all bounded refs
- user-facing output separates confirmed content, unresolved gaps, failures,
  revision proposals, and provenance

## Verification Commands

Use the narrowest command set while developing, then run the full set before
claiming the goal complete:

```bash
npm run check:ts-core
npx vitest run src/core-runtime/reconstruct
npx vitest run src/core-api/reconstruct-api.test.ts
npm run test:mcp:review
git diff --check
```

`npm run test:mcp:review` remains in scope because reconstruct shares the MCP
server surface with review.
