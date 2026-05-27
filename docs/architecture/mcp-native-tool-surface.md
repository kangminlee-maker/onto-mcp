# MCP-Native Tool Surface

The product goal is for Codex, Claude, and future hosts to call `onto` as a
small set of tools with a stable MCP surface.

## Tool Set

| Tool | Purpose | Primary output |
|---|---|---|
| `onto.review` | Start and optionally run a review | session id, status, artifact refs, `resultClassificationSummary`, `llmPresentation` prompts |
| `onto.prepare_review` | Materialize interpretation, binding, plan, and prompt packets without executing lenses | execution plan refs, opening brief prompt |
| `onto.review_status` | Read progress for a review session | structured status plus `llmPresentation.progress` with liveness state and current classification signal |
| `onto.review_continue` | Planned: continue a halted/prepared review from existing artifacts without re-running completed units | continuation plan, executed/reused unit ids, updated artifact refs, status |
| `onto.review_result` | Read final result and artifact refs | `review-record.yaml`, `final-output.md`, `resultClassificationSummary` |
| `onto.list_lenses` | Show canonical lens sets | full/core-axis lens IDs |
| `onto.list_domains` | Show available domains | domain IDs and source dirs |
| `onto.list_source_profiles` | Show reconstruct source profiles | source profile refs keyed by `target_material_kind` |
| `onto.observe_source` | Materialize reconstruct source observations | `target-material-profile.yaml`, `source-inventory.yaml`, `source-observations.yaml`, initial `reconstruct-record.yaml` |
| `onto.validate_reconstruct_directive` | Validate LLM-authored reconstruct directive files | validation artifact with status and violations |
| `onto.reconstruct` | Run the material-aware reconstruct post-Seed artifact loop with explicit mock semantic/confirmation realization | post-Seed artifacts, `final-output.md`, `reconstruct-run-manifest.yaml`, `reconstruct-record.yaml` |
| `onto.reconstruct_status` | Read reconstruct progress/result state | record stage, stage progress, liveness, count summary, and artifact refs |
| `onto.reconstruct_result` | Read reconstruct result artifacts | record, run manifest, progress projection, and final output text |

## Review Continuation

Review continuation is the planned MCP surface for operator-controlled resume of
an existing review session. The canonical design is
`docs/architecture/review-continuation-surface.md`.

The pipeline execution ledger behind this surface is not review-specific. The
shared contract is
`.onto/processes/shared/pipeline-execution-ledger-contract.md`; `review`,
`reconstruct`, future `evolve`, and later onto pipelines should all expose the
same trust/provenance projection through their status and result surfaces.

The public concept is `review_continue`, not subagent management. The runtime
continues artifact-backed review units: lens units, issue artifact units,
per-lens deliberation units, teamlead controlled deliberation, and synthesize.

`onto.review_status` remains the read surface. For `halted_partial` and
`prepared` sessions it should expose a derived `continuationPlan` projection:
which artifacts are reusable, which unit is missing or failed, which units would
run, a derived pipeline execution ledger that marks artifact trust boundaries, and
whether manifest/context/route validation blocks continuation.

`onto.review_continue` should:

- accept `sessionRoot`, optional `projectRoot`, and optional `targetUnits`;
- derive its continuation frontier from the pipeline execution ledger's trust and
  completion boundary;
- reuse completed units and reject attempts to overwrite completed outputs;
- derive the minimal continuation frontier when `targetUnits` is omitted;
- validate manifest source hashes, packet hashes, consumer admission, context
  eligibility, generated packet refs, and route consistency before dispatch;
- preserve malformed or partial failed outputs before replacing them;
- write continuation attempt provenance under the same review session;
- update the session-level execution result and final artifacts only after the
  continuation attempt validates.

Continuation must not accept `resume_token` as authorization. The token remains
audit/idempotency data.

## Reconstruct Tools

`reconstruct` has a bounded MCP surface. These tools stay runtime-gated and do
not make the runtime an ontology meaning author:

| Tool | Purpose |
|---|---|
| `onto.list_source_profiles` | list reconstruct source profiles by `target_material_kind` and support status |
| `onto.observe_source` | return deterministic material-structure observations |
| `onto.validate_reconstruct_directive` | validate LLM-authored reconstruct directives |
| `onto.reconstruct` | orchestrate the post-Seed artifact loop through explicit `semanticAuthorRealization` and `confirmationProviderRealization`; only `mock` is wired today |
| `onto.reconstruct_status` | read the current `reconstruct-record.yaml` plus stage progress, liveness, and count summary projection |
| `onto.reconstruct_result` | return the record, run manifest, progress projection, and final output text |

These tools should be added through the bounded Core API facade in
`src/core-api/reconstruct-api.ts`. The facade covers source-profile listing,
preparation artifact materialization, directive validation, post-Seed run
orchestration, status, and result reads; MCP schemas should remain a thin
projection over that surface.

`onto.reconstruct_status` and `onto.reconstruct_result` should use the same
shared `PipelineExecutionLedger` trust/provenance model when reconstruct
stage validation expands. LLM-authored reconstruct artifacts are not trusted
merely because they exist; the matching runtime validation unit must complete.

Reconstruct MCP schemas must keep `target_material_kind` separate from domain,
medium, target input kind, and review context `source_kind`. The shared goal
contract is `.onto/processes/shared/target-material-kind-contract.md`.

`onto.reconstruct` requires callers to pass
`semanticAuthorRealization="mock"` and `confirmationProviderRealization="mock"`
until a real host/direct-call semantic author and user-mediated confirmation
provider are exposed. This keeps the public route honest: a completed run is a
bounded mock-author post-Seed loop, not proof that runtime authored ontology
meaning or that live host confirmation occurred.

The run manifest records `happy_path_scope.implemented_artifacts` and
`happy_path_scope.deferred_artifacts`. Deferred artifacts currently include
domain context selection and its validation only; claim realization,
confirmation validation, competency-question assessment, failure classification,
revision proposal, metrics, stop decision, and final output provenance are
implemented in the mock-authored runtime-gated path.

The post-Seed design is captured in
`.onto/processes/reconstruct/reconstruct-boundary-contract.md` and
`.onto/processes/reconstruct/reconstruct-execution-ux-contract.md`. MCP status
and result shapes should expose bounded stage facts, count summaries, liveness,
and artifact refs so the host LLM can render progress and final output without
creating a separate UI or semantic authority.

Future `evolve` tools are not active. When designed, they must follow
`.onto/processes/evolve/material-kind-adapter-contract.md`: classify
`target_material_kind` before adapter dispatch, fail explicitly for unsupported
or unknown non-code material, and keep design specification content owned by the
host LLM and user-mediated flow.

## Non-Goals

- MCP does not redefine lens semantics.
- MCP does not choose a different artifact contract.
- MCP does not hide degraded runs; status and result tools must expose them.
- MCP stdout is not the user-facing UX contract. Runtime returns bounded facts;
  the host LLM renders opening, progress, halt, and result explanations from
  `llmPresentation` prompt/input pairs.
- MCP native progress is transport only. When a caller supplies
  `_meta.progressToken` on `onto.review`, the server emits
  `notifications/progress` with versioned `ontoReviewProgress` metadata. The
  canonical read surface remains `onto.review_status`, and progress step ids
  come from the shared runtime progress contract projected into
  `review-run-manifest.yaml`.
- MCP does not create a second materiality concept. Result materiality is derived
  from the active `severity` contract: `blocker`, `high`, and `medium` are
  material; `low` and `info` are non-material.
- MCP does not add generic public concepts for timeout or retry policy. Long
  running review units halt through the existing execution result artifacts;
  malformed output and artifact write failures continue to use structured
  failure records. Review continuation is a bounded artifact-backed continuation
  surface, not a generic retry policy or subagent lifecycle API.
- MCP reconstruct tools must not become an ontology generator. The host LLM owns
  Seed candidates, competency questions, failure classifications, revision
  proposals, and stop decisions.

## Provider And Route Selection

`llm.provider` is user configuration authority for the model provider:
`openai`, `anthropic`, `grok`, or `lmstudio`. Review execution then derives
the runtime route from that input, auth mode, host availability, and the review
execution profile. Route-derived fields such as executor, resolved provider,
and auth mode are reported for observability. The TS route projection helper is
an internal derivation point; MCP and CLI entrypoints accept the parent
execution profile inputs, then report route visibility after derivation.

```text
review requested
        |
        v
parallel isolated lens contexts
        |
        v
controlled_lens_deliberation
        |
        v
synthesize consumes deliberation.md
```

Claude Code Agent Teams can realize the deliberation transport with
SendMessage transport. Other MCP providers realize the same `onto` behavior by
running bounded deliberation packets in separate contexts. `synthesize` is not
the conflict-resolution stage.

Each review unit is bounded by runtime timeout handling. A stalled lens,
issue-artifact, deliberation, or synthesize unit halts through
`execution-result.yaml`, `degradation-summary.yaml`, and
`review-run-manifest.yaml` instead of silently falling back or blocking the
review indefinitely. A later `onto.review_continue` call may continue from those
artifacts only after freshness and eligibility gates pass.

## First Implementation Slice

1. Export a TS core API facade from `src/core-api/`.
2. Keep repository-local npm harnesses available for verification.
3. Add MCP schemas from `src/mcp/tool-schemas.ts`.
4. Keep mock and direct-call execution inside bounded runtime adapters.
5. Write conformance tests against generated review artifacts.
