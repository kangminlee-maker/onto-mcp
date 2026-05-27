# MCP-Native Tool Surface

The product goal is for Codex, Claude, and future hosts to call `onto` as a
small set of tools with a stable MCP surface.

## Tool Set

| Tool | Purpose | Primary output |
|---|---|---|
| `onto.review` | Start and optionally run a review | session id, status, artifact refs, `resultClassificationSummary`, `llmPresentation` prompts |
| `onto.prepare_review` | Materialize interpretation, binding, plan, and prompt packets without executing lenses | execution plan refs, opening brief prompt |
| `onto.review_status` | Read progress for a review session | structured status plus `llmPresentation.progress` with liveness state and current classification signal |
| `onto.review_result` | Read final result and artifact refs | `review-record.yaml`, `final-output.md`, `resultClassificationSummary` |
| `onto.list_lenses` | Show canonical lens sets | full/core-axis lens IDs |
| `onto.list_domains` | Show available domains | domain IDs and source dirs |
| `onto.list_source_profiles` | Show reconstruct source profiles | source profile refs keyed by `target_material_kind` |
| `onto.observe_source` | Materialize reconstruct source observations | `target-material-profile.yaml`, `source-inventory.yaml`, `source-observations.yaml`, initial `reconstruct-record.yaml` |
| `onto.validate_reconstruct_directive` | Validate LLM-authored reconstruct directive files | validation artifact with status and violations |
| `onto.reconstruct` | Run the material-aware reconstruct happy path with explicit mock semantic/confirmation realization | `final-output.md`, `reconstruct-run-manifest.yaml`, `reconstruct-record.yaml` |
| `onto.reconstruct_status` | Read reconstruct progress/result state | record stage and artifact refs |
| `onto.reconstruct_result` | Read reconstruct result artifacts | record, run manifest, and final output text |

## Reconstruct Tools

`reconstruct` has a bounded MCP surface. These tools stay runtime-gated and do
not make the runtime an ontology meaning author:

| Tool | Purpose |
|---|---|
| `onto.list_source_profiles` | list reconstruct source profiles by `target_material_kind` and support status |
| `onto.observe_source` | return deterministic material-structure observations |
| `onto.validate_reconstruct_directive` | validate LLM-authored reconstruct directives |
| `onto.reconstruct` | orchestrate the happy path through explicit `semanticAuthorRealization` and `confirmationProviderRealization`; only `mock` is wired today |
| `onto.reconstruct_status` | read the current `reconstruct-record.yaml` projection |
| `onto.reconstruct_result` | return the record, run manifest, and final output text |

These tools should be added through the bounded Core API facade in
`src/core-api/reconstruct-api.ts`. The facade covers source-profile listing,
preparation artifact materialization, directive validation, happy-path run
orchestration, status, and result reads; MCP schemas should remain a thin
projection over that surface.

Reconstruct MCP schemas must keep `target_material_kind` separate from domain,
medium, target input kind, and review context `source_kind`. The shared goal
contract is `.onto/processes/shared/target-material-kind-contract.md`.

`onto.reconstruct` requires callers to pass
`semanticAuthorRealization="mock"` and `confirmationProviderRealization="mock"`
until a real host/direct-call semantic author and user-mediated confirmation
provider are exposed. This keeps the public route honest: a completed run is a
bounded mock-author happy path, not proof that runtime authored ontology
meaning or that live host confirmation occurred.

The run manifest records `happy_path_scope.implemented_artifacts` and
`happy_path_scope.deferred_artifacts`. Deferred artifacts currently include
domain context selection, failure classification, and revision proposal; callers
must treat those as outside the current happy path.

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
- MCP does not add separate public concepts for timeout or retry policy. Long
  running review units halt through the existing execution result artifacts;
  malformed output and artifact write failures continue to use structured
  failure records.
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
review indefinitely.

## First Implementation Slice

1. Export a TS core API facade from `src/core-api/`.
2. Keep repository-local npm harnesses available for verification.
3. Add MCP schemas from `src/mcp/tool-schemas.ts`.
4. Keep mock and direct-call execution inside bounded runtime adapters.
5. Write conformance tests against generated review artifacts.
