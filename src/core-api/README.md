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
