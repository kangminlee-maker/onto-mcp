# Core API

`src/core-api/` is the future library-facing facade over the existing
`src/core-runtime/` implementation.

The goal is to let MCP, repository-local harnesses, and provider tests call the same review behavior
without re-implementing interpretation, binding, prompt packet materialization,
synthesis, final result explanation, or ReviewRecord assembly.

Core API results expose `llmPresentation` prompt/input pairs so MCP hosts can
explain the opening brief, progress, halted partial state, and final result from
bounded runtime facts instead of scraping CLI stdout.

Review results also expose `resultClassificationSummary`, the runtime-derived
projection that separates material issues from non-material findings using the
active severity contract: `blocker`/`high`/`medium` are material, while
`low`/`info` are non-material.

`runReview` supports timeout-safe MCP operation through
`returnRunningAfterMs`. If a session is planned but final artifacts are not
ready within that caller window, it returns `status="running"` with a
`runHandle`; background execution continues under the same session root. The
handle is a projection, not review truth. Callers should poll `getReviewStatus`
or use `findLatestReviewSessions` with the handle's artifact-derived
`requestHash` if the handle was lost. That hash is a canonical request identity
hash, not just target/intent/domain.

`llmPresentation.progress.input.liveness` gives polling hosts a bounded waiting
signal even when no new review artifact has appeared yet: generated time,
recommended next poll interval, last observed artifact, elapsed time since that
artifact, and a concise waiting/stale summary.

MCP hosts that support native progress can also pass `_meta.progressToken` on
`onto.review`. The MCP server emits `notifications/progress` with versioned
`ontoReviewProgress` metadata while the long-running call is active. This is a
transport projection only; `onto.review_status` remains the canonical
artifact-backed read surface.

Progress step ids, labels, and total count come from the shared review progress
contract used by both runtime manifests and Core API status projection.

`continueReview` is the Core API counterpart to `onto.review_continue`: it
builds the review continuation plan from the PipelineExecutionLedger, stores an
attempt manifest, validates session-owned execution-plan paths, backs up
superseded unit and session-level artifacts that already exist, dispatches only
the ledger frontier/downstream units, restores backups on failed attempts, and
reassembles final review artifacts when synthesize completes.
Eligibility is expressed through `runControl.continuationAvailable`, including
prepared, halted, failed-attempt, and stale-active states.
`continueReview(request)` returns `Promise<ReviewContinueResult>`: the public
decision surface is `decision: "executed" | "already_running"` plus session
identity, status, artifact refs, failure refs, optional continuation
plan/attempt facts, optional prompt execution result, route/presentation
projections, and active-attempt facts for duplicate-dispatch responses.
When an active attempt already owns the requested frontier, it returns
`decision="already_running"` with active attempt facts instead of dispatching a
duplicate run.

`cancelReview` is the Core API counterpart to `onto.review_cancel`. It writes a
session-local `review-cancel-request.yaml` for a non-terminal review. The runner
checks for that request at runtime cancellation checkpoints and records a
structured halted result with `halt_phase="cancellation"` when the request is
observed. Cancellation is accepted only while `runControl.cancellationAvailable`
is true; prepared, terminal, stale, or failed sessions return
`decision="not_cancellable"` or `decision="already_terminal"` without writing an
orphan request. This is separate from host-call timeout, which leaves the review
running under the same session handle.

`getReviewResult` supports `compact`, `standard`, and `full` projections.
Compact omits `ReviewRecord` and final output text while preserving status,
classification summary, material issues, target material support, warning facts,
and artifact refs. Full preserves the previous complete readback behavior.

Review status and result projections expose target material support from
`review-target-profile.yaml`. Non-fatal worker stderr is captured in
`environment-warnings.yaml` and surfaced as operational warning facts, not as
review findings. The warning channel accepts only runner-scoped warning lines,
so unrelated process-global console output is not promoted into warning facts.

`getReviewResult` validates resolved `ReviewRecord.final_output_ref` paths
against the session boundary before returning final output path or content.
Boundary containment uses the shared runtime primitive in
`src/core-runtime/path-boundary.ts`, so Core API, MCP, and CLI surfaces keep the
same lexical and realpath-aware semantics while preserving surface-specific
errors. Review execution-plan refs are validated through
`src/core-runtime/review/execution-plan-boundary.ts` before continuation or
direct prompt-runner execution consumes plan-owned output paths.
Explicit domain tokens are preflighted before dispatch: exact and alias matches
proceed, while unknown tokens return a `ReviewDomainResolutionError` with either
`resolution="suggestion"` and candidate ids or `resolution="unknown"`.

`reconstruct-api.ts` is the bounded facade for the reconstruct MCP surface. It
lists source profiles, materializes preparation artifacts, validates
LLM-authored directive files, runs the material-aware post-Seed artifact loop,
assembles `reconstruct-record.yaml`, and reads status/result artifacts back.
It does not author Seed content, claim realization, competency questions,
assessments, failure classifications, revisions, or design decisions; those come
from a pluggable directive author or confirmation provider. Runtime validates
ids, refs, enums, coverage, metrics, stage state, and final-output provenance.
The current public run path requires explicit `semanticAuthorRealization="mock"`
and `confirmationProviderRealization="mock"` so mock-authored output is not
confused with a live host/user-mediated reconstruct run.
