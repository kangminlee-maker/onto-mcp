# MCP

`src/mcp/` owns the tool-call surface that Codex, Claude, and other MCP-capable
hosts should see.

This layer should stay thin:

- validate tool inputs;
- call the TS core API;
- return structured status, result, and artifact refs;
- emit `notifications/progress` during `onto.review` when the caller supplies
  `_meta.progressToken`;
- avoid redefining lens, domain, review, reconstruct, or synthesis semantics.

Progress notifications are a host transport convenience. The canonical progress
read model remains `onto.review_status` plus artifact-backed
`llmPresentation.progress`. The MCP layer forwards Core API progress events and
does not define its own progress step taxonomy.

`onto.review_continue` is the write surface for a prepared or halted review
session. It derives the frontier from the session PipelineExecutionLedger, reuses
trusted units, accepts only the current frontier when `targetUnits` is provided,
reruns the frontier and downstream units, validates session-owned execution-plan
paths, backs up/restores superseded artifacts around the attempt, and writes
continuation attempt provenance inside the review session.

The reconstruct tools are bounded projections over `src/core-api/reconstruct-api.ts`:
source profile listing, material-aware source observation, LLM-authored
directive validation, post-Seed run orchestration, status, and result reads.
They return artifact refs, validation status, stage progress, count summaries,
records, manifests, and final output text; they do not author ontology Seeds,
claim realization, failure classifications, revision proposals, or design
decisions.
`onto.reconstruct` currently requires explicit
`semanticAuthorRealization="mock"` and `confirmationProviderRealization="mock"`
arguments. Host/direct-call semantic authoring and user-mediated confirmation
are intentionally not implied by a completed mock run.
