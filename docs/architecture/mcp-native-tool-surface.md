# MCP-Native Tool Surface

The product goal is for Codex, Claude, and future hosts to call `onto` as a
small set of tools with a stable MCP surface.

## Tool Set

| Tool | Purpose | Primary output |
|---|---|---|
| `onto_review` | Start and optionally run a review | session id, status, run handle, artifact refs, `resultClassificationSummary`, `llmPresentation` prompts |
| `onto_prepare_review` | Materialize interpretation, binding, plan, and prompt packets without executing lenses | execution plan refs, opening brief prompt |
| `onto_review_status` | Read progress for a review session or recover the latest matching session | structured status plus `llmPresentation.progress`, liveness, run-control, material-support, warning, and latest-session projections |
| `onto_review_continue` | Continue a review when `runControl.continuationAvailable` is true without re-running trusted or active units | continuation plan, continuation attempt refs, updated artifact refs, status, or `already_running` decision |
| `onto_review_round` | Host orchestration (B): return the units ready to execute now with prompt packets materialized; onto does not execute them | round result (`in_progress` ready units / `ready_to_assemble` / `halted`), packet refs |
| `onto_review_advance` | Host orchestration (B): report host-executed units; onto validates seats, records results and gates, returns the next round or assembles the `ReviewRecord` | next round result or assembled record refs |
| `onto_review_cancel` | Request cancellation for a running review session | cancellation request artifact ref plus updated status/run-control projection |
| `onto_review_result` | Read final result and artifact refs | compact/standard/full projection; `compact` and `standard` keep bounded count-and-signal summaries, `full` includes `review-record.yaml` and `final-output.md` |
| `onto_list_lenses` | Show canonical lens sets | full/core-axis lens IDs |
| `onto_list_domains` | Show available domains | domain IDs and source dirs |
| `onto_list_source_profiles` | Show reconstruct source profiles | source profile refs keyed by `target_material_kind` |
| `onto_observe_source` | Materialize reconstruct source observations | `target-material-profile.yaml`, `source-inventory.yaml`, `source-observations.yaml`, initial `reconstruct-record.yaml` |
| `onto_validate_reconstruct_directive` | Validate LLM-authored reconstruct directive files | validation artifact with status and violations |
| `onto_reconstruct` | Run the material-aware reconstruct post-Seed artifact loop with direct-call semantic/confirmation realization | post-Seed artifacts, `final-output.md`, `reconstruct-run-manifest.yaml`, `reconstruct-record.yaml` |
| `onto_reconstruct_status` | Read reconstruct progress/result state | record stage, stage progress, liveness, count summary, and artifact refs |
| `onto_reconstruct_result` | Read reconstruct result artifacts | record, run manifest, progress projection, and final output text |

## Long-Running Review Recovery

`onto_review` uses a bounded synchronous window for MCP hosts. Once session
metadata and the execution plan exist, the Core API can return a versioned
`runHandle` with `sessionId`, `sessionRoot`, `requestHash`, current status,
domain resolution, target summary, key artifact refs, and a poll interval.
When the review finishes before that window closes, the response remains the
completed review result. When the window closes first, the response has
`status: running`; execution continues under the same session.

The handle is not review truth. It is a projection over session artifacts plus
active attempt metadata. The artifact truth remains the session root:
`session-metadata.yaml`, `execution-plan.yaml`, `execution-result.yaml`,
`review-run-manifest.yaml`, `review-record.yaml`, and related review artifacts.

`onto_review_status` is the canonical polling and recovery surface. Callers can
pass `sessionRoot`, or pass `latest=true` with optional `target`, `domain`, and
`requestHash` filters to recover the newest matching session under
`projectRoot`. The latest-session lookup does not infer review findings; it only
returns session identity, status, request hash, and artifact refs. The request
hash is a canonical request identity hash derived from session artifacts,
including target scope, bundle refs, resolved domain, review mode, and selected
lenses when available.

Status now exposes `runControl.lifecycleState`, `runControl.activeAttempt`,
`alreadyRunning`, cancellation/continuation availability, retry semantics,
host-timeout semantics, target material support from
`review-target-profile.yaml`, and `environmentWarnings` from
`environment-warnings.yaml` when non-fatal worker warnings are observed.

`onto_review_cancel` writes a session-local `review-cancel-request.yaml`.
Cancellation is cooperative: the runner checks for that request at runtime
cancellation checkpoints and, when observed, closes through
`execution-result.yaml` with `execution_status=halted_partial` and
`halt_phase=cancellation`. Cancellation is accepted only when run-control reports
an active cancellable attempt; prepared, terminal, failed, or stale sessions do
not receive orphan cancellation-request artifacts. This keeps cancellation
separate from host-call timeouts and unit timeouts.

Explicit domain tokens are normalized only for sigil/no-domain syntax before
dispatch. Exact canonical matches proceed; retired aliases and unknown explicit tokens fail before dispatch with
`ReviewDomainTokenResolution.resolution` set to `suggestion` when safe
suggestions exist, or `unknown` when they do not.

Result readers validate resolved `ReviewRecord.final_output_ref` paths against
the session disclosure boundary before returning final output paths or content.
Core API, MCP, and CLI callers share the canonical lexical and realpath-aware
boundary primitive in `src/core-runtime/path-boundary.ts`; each surface only
owns its error shape. Review execution-plan path validation is centralized in
`src/core-runtime/review/execution-plan-boundary.ts` and is used before Core API
continuation and direct prompt-runner dispatch consume plan-owned paths.
Code targets report `targetMaterialSupport.supportStatus="supported"`; document
and mixed material targets remain visible as partial where material-specific
validation is not implemented.

## Review Continuation

Review continuation is the MCP surface for operator-controlled resume of
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

`onto_review_status` remains the read surface. When
`runControl.continuationAvailable` is true, including prepared, halted, failed
attempt, and stale-active states, it exposes a derived `continuationPlan`
projection: which artifacts are reusable, which unit is missing or failed, which
units would run, a derived pipeline execution ledger that marks artifact trust
boundaries, and whether manifest/context/route validation blocks continuation.

`onto_review_continue`:

- accept `sessionRoot`, optional `projectRoot`, and optional `targetUnits`;
- derive its continuation frontier from the pipeline execution ledger's trust and
  completion boundary;
- normalize public target aliases such as `lens:{lens_id}` and
  `deliberation:{lens_id}` to ledger unit ids, then reject requests that do not
  match the current continuation frontier;
- reuse trusted completed units and reject requests whose target units are
  already trusted;
- derive the minimal continuation frontier when `targetUnits` is omitted;
- preserve malformed or partial failed outputs before replacing them;
- write continuation attempt provenance under the same review session;
- back up session-level execution artifacts before dispatch and restore those
  backups if the continuation attempt fails;
- return `decision: already_running` instead of dispatching when an active
  attempt already owns the requested frontier.

The MCP response is a projection over the Core API `ReviewContinueResult`:
`decision` is `"executed"` or `"already_running"`, while session identity,
status, artifact refs, failure refs, optional continuation attempt/plan facts,
route/presentation projections, and active-attempt facts remain available in the
structured result.

Continuation must not accept `resume_token` as authorization. The token remains
audit/idempotency data.

## Reconstruct Tools

`reconstruct` has a bounded MCP surface. These tools stay runtime-gated and do
not make the runtime an ontology meaning author:

| Tool | Purpose |
|---|---|
| `onto_list_source_profiles` | list reconstruct source profiles by `target_material_kind` and support status |
| `onto_observe_source` | return deterministic material-structure observations |
| `onto_validate_reconstruct_directive` | validate LLM-authored reconstruct directives |
| `onto_reconstruct` | orchestrate the post-Seed artifact loop through direct-call `semanticAuthorRealization` and `confirmationProviderRealization` |
| `onto_reconstruct_status` | read the current `reconstruct-record.yaml` plus stage progress, liveness, and count summary projection |
| `onto_reconstruct_result` | return the record, run manifest, progress projection, and final output text |

These tools should be added through the bounded Core API facade in
`src/core-api/reconstruct-api.ts`. The facade covers source-profile listing,
preparation artifact materialization, directive validation, post-Seed run
orchestration, status, and result reads; MCP schemas should remain a thin
projection over that surface.

`onto_reconstruct_status` and `onto_reconstruct_result` should use the same
shared `PipelineExecutionLedger` trust/provenance model when reconstruct
stage validation expands. LLM-authored reconstruct artifacts are not trusted
merely because they exist; the matching runtime validation unit must complete.

Reconstruct MCP schemas must keep `target_material_kind` separate from domain,
medium, target input kind, and review context `source_kind`. The shared goal
contract is `.onto/processes/shared/target-material-kind-contract.md`.

`onto_reconstruct` exposes only the `direct_call` realization for semantic
authoring and confirmation-provider execution. Test-double realizations are not
part of the public MCP workflow surface.

The run manifest records `happy_path_scope.implemented_artifacts` and
`happy_path_scope.deferred_artifacts`. Domain competency admission is active
governing-snapshot truth rather than a separate domain competency selection artifact.
Claim realization, confirmation validation, competency-question assessment,
failure classification, revision proposal, metrics, stop decision, and final
output provenance are implemented in the runtime-gated path.

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
  `_meta.progressToken` on `onto_review`, the server emits
  `notifications/progress` with versioned `ontoReviewProgress` metadata. The
  canonical read surface remains `onto_review_status`, and progress step ids
  come from the shared runtime progress contract projected into
  `review-run-manifest.yaml`.
- MCP does not create a second materiality concept. Result materiality is the
  classification/disclosure projection defined by
  `.onto/processes/review/material-issue-contract.md`. This disclosure is not a
  hot-path gate; blocking is owned only by deterministic runtime
  structural/contract failures.
- MCP does not add generic public concepts for timeout or retry policy. Long
  running review units halt through the existing execution result artifacts;
  host-call timeout leaves the review running under the same session handle;
  malformed output and artifact write failures continue to use structured
  failure records. Review continuation is a bounded artifact-backed continuation
  surface, not a generic retry policy or subagent lifecycle API.
- MCP reconstruct tools expose the LLM-authored semantic artifact workflow. The
  host LLM owns ontology seeds, competency questions, failure classifications,
  revision proposals, and stop decisions; runtime owns structural observation,
  artifact persistence, deterministic validation gates, and bounded status
  projection.

## Provider And Route Selection

In `settings.json/v3`, each actor owns a complete LLM block. Review actors use
`review.execution.actors.*.llm`; reconstruct direct-call actors use
`reconstruct.execution.actors.semantic_author.llm` and
`reconstruct.execution.actors.confirmation_provider.llm`. There is no root
`llm.default`, no root reconstruct LLM setting, and no actor inheritance in the
canonical settings shape. Review execution route selection belongs to
`review.execution.executor`: `auto` derives the route from the actor LLM
selections, auth mode, host availability, and execution topology, while
non-auto settings remain compatibility controls behind the resolved execution
profile. Public route visibility is expressed with canonical fields such as
`execution_route`, `execution_adapter`, `model_provider`, `auth_mode`,
`billing_mode`, `wire_format`, and `model_id`.
Legacy fields such as executor and resolved provider may still be reported for
observability, but they are compatibility projections. The TS route projection
helper is an internal derivation point; MCP entrypoints accept canonical
`executionRoute` only as a bounded override and otherwise report route
visibility after settings-driven derivation.

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
review indefinitely. A later `onto_review_continue` call may continue from those
artifacts only after freshness and eligibility gates pass.

## First Implementation Slice

1. Export a TS core API facade from `src/core-api/`.
2. Keep repository-local npm harnesses available for verification.
3. Add MCP schemas from `src/mcp/tool-schemas.ts`.
4. Keep Codex and direct-call execution inside bounded runtime adapters.
5. Write conformance tests against generated review artifacts.
