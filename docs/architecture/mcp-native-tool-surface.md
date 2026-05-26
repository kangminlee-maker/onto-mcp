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
