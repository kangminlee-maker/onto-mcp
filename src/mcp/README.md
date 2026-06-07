# MCP

`src/mcp/` owns the tool-call surface that Codex, Claude, and other MCP-capable
hosts should see.

This layer should stay thin:

- validate tool inputs;
- call the TS core API;
- return structured status, result, and artifact refs;
- emit `notifications/progress` during `onto_review` when the caller supplies
  `_meta.progressToken`;
- avoid redefining lens, domain, review, reconstruct, or synthesis semantics.

`onto_review` is timeout-safe for MCP hosts: the server passes a bounded wait
budget to the Core API, so a long review can return `status="running"` with a
durable `runHandle` before the host call times out. The review keeps running in
the same session. `onto_review_status` can poll by `sessionRoot`, or recover the
latest matching session with `latest=true` plus optional `target`, `domain`, and
`requestHash` filters. `requestHash` is a canonical artifact-derived request
identity hash that includes target scope and selected review shape when
available.

Progress notifications are a host transport convenience. The canonical progress
read model remains `onto_review_status` plus artifact-backed
`llmPresentation.progress`. The MCP layer forwards Core API progress events and
does not define its own progress step taxonomy.

`onto_review_continue` is the write surface when
`runControl.continuationAvailable` is true, including prepared, halted,
failed-attempt, and stale-active sessions. It derives the frontier from the
session PipelineExecutionLedger, reuses trusted units, accepts only the current
frontier when `targetUnits` is provided, reruns the frontier and downstream
units, validates session-owned execution-plan paths, backs up/restores
superseded artifacts around the attempt, and writes continuation attempt
provenance inside the review session.
When a prepared session has no prior run manifest, callers use canonical
`executionRoute` (`external_oauth_worker` or `direct_model_call`) to choose the
continuation route. Brand-specific executor switches are kept out of the MCP
schema and remain CLI/debug compatibility only.
If the requested frontier is already owned by an active attempt, the tool
returns `decision="already_running"` instead of dispatching duplicate work.
The MCP result is a projection over Core API `ReviewContinueResult`: it
preserves the same decision values while shaping session/status/artifact/failure
refs, continuation attempt facts, and active-attempt facts for MCP callers.

`onto_review_cancel` requests cooperative cancellation for a running session.
It writes `review-cancel-request.yaml`; the runner observes that request at the
next runtime cancellation checkpoint and closes the session as
`halted_partial` with `halt_phase="cancellation"`. Host-call timeout still means
the review continues under the same session handle unless a cancellation
request is made. The tool does not write cancellation artifacts for prepared,
terminal, failed, or stale sessions; those return a not-cancellable decision and
the current run-control facts.

`onto_review_result` defaults to a bounded `standard` projection. Callers can ask
for `compact` to omit final output text and the full ReviewRecord, or `full` to
read the complete record and final output text. Status and result projections
also surface target material support and non-fatal environment warnings from the
session artifacts. Result reads validate `final_output_ref` against the session
boundary before returning content. The MCP server uses the shared runtime
path-boundary primitive and only owns MCP-specific failure shaping. Execution
plan refs are validated by the shared review execution-plan boundary helper
before continuation or direct prompt-runner dispatch. Code targets are reported as supported.
Document and mixed targets keep partial material-support disclosure where
material-specific validation remains partial.

The reconstruct tools are bounded projections over `src/core-api/reconstruct-api.ts`:
source profile listing, material-aware source observation, LLM-authored
directive validation, integral reconstruct run orchestration, status, and result reads.
They return artifact refs, validation status, stage progress, count summaries,
records, manifests, and final output text; they do not author ontology Seeds,
claim realization, failure classifications, revision proposals, or design
decisions.
`onto_reconstruct` defaults to direct-call semantic authoring and direct-call
host-mediated confirmation through the configured `llm` provider. Missing
provider/model/credentials and invalid LLM-authored artifact shapes fail loud;
fixed input artifacts may support local checks, but product completion evidence
requires the actual runtime/provider path.
