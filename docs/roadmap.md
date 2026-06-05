# Onto MCP Roadmap

## Current State

- Existing TS `onto` runtime is preserved.
- `.onto` YAML/MD assets remain the language-neutral contract.
- New repo direction is TS core + MCP-native tool surface.
- External adapter experiments are evidence and conformance input, not the main
  product path.

## Stage 1 — Core API Facade

Done when:

- `src/core-api/` exposes prepare/run/status/result functions over the existing
  runtime behavior.
- Repository-local npm harnesses call the same runtime behavior.
- Core API calls return structured artifact references instead of only terminal
  output.

## Stage 2 — MCP Tool Server

Done when:

- `src/mcp/` exposes stable tool schemas.
- A local MCP server can list tools and route calls into the core API.
- `onto_review`, `onto_review_status`, and `onto_review_result` work with a
  mock/local provider.

## Stage 3 — Execution Profiles

Done when:

- `settings.json` resolves to worker, direct-call, or mock execution.
- Local/mock and Codex worker paths have conformance tests.
- Additional provider guarantees are documented before implementation.

## Stage 4 — Controlled Deliberation

Done when:

- Providers can report whether isolated workers are available.
- Controlled lens deliberation is selected from runtime settings and recorded
  in review artifacts.
- Lens-to-lens deliberation evidence is preserved separately from synthesis.

## Stage 4.5 — Review Continuation

Done when:

- The shared `PipelineExecutionLedger` contract is implemented as a derived
  trust/provenance projection for `review`, with the same shape reserved for
  `reconstruct`, future `evolve`, and later onto pipelines.
- `onto_review_status` exposes a derived pipeline execution ledger that marks
  artifact trust boundaries and feeds the continuation plan for prepared and
  halted review sessions.
- `onto_review_continue` continues a session from existing artifacts by running
  only failed or missing review units.
- Completed unit outputs are reused and completed unit overwrite attempts are
  rejected.
- Optional continuation targets must match the current ledger frontier; public
  aliases such as `lens:logic` normalize to canonical ledger unit ids.
- Manifest, packet, context eligibility, and route drift stop before dispatch
  with structured failure records.
- Continuation attempt provenance, session-level artifact backups, failed-attempt
  restore evidence, and route provenance are preserved under the same review
  session.

## Stage 4.6 — Reconstruct Post-Seed Loop

Done when:

- reconstruct stage ids, artifact authority, and progress UX follow
  `.onto/processes/reconstruct/reconstruct-boundary-contract.md` and
  `.onto/processes/reconstruct/reconstruct-execution-ux-contract.md`.
- Runtime validates claim realization, confirmation-derived claim sets,
  competency-question assessment, failure classification, revision proposal, and
  final-output provenance without authoring ontology meaning.
- `onto_reconstruct_status` and `onto_reconstruct_result` expose bounded facts,
  counts, liveness, and artifact refs for host-rendered progress and final
  output.
- A fixture run produces the full post-Seed artifact set and validates
  `reconstruct-record.yaml`.

## Stage 5 — Migration And Cleanup

Done when:

- External parity prototype code is either archived, converted into
  conformance fixtures, or replaced by provider tests.
- User-facing docs describe MCP tool usage as the primary integration path.
- Any new remote repository is configured intentionally; old local repos remain
  as references until migration is complete.
