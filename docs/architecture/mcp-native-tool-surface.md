# MCP-Native Tool Surface

The product goal is for Codex, Claude, and future hosts to call `onto` as a
small set of tools instead of remembering platform-specific CLI paths.

## Tool Set

| Tool | Purpose | Primary output |
|---|---|---|
| `onto.review` | Start and optionally run a review | session id, status, artifact refs |
| `onto.prepare_review` | Materialize interpretation, binding, plan, and prompt packets without executing lenses | execution plan refs |
| `onto.review_status` | Read progress for a review session | structured status |
| `onto.review_result` | Read final result and artifact refs | `review-record.yaml`, `final-output.md` |
| `onto.list_lenses` | Show canonical lens sets | full/core-axis lens IDs |
| `onto.list_domains` | Show available domains | domain IDs and source dirs |

## Non-Goals

- MCP does not redefine lens semantics.
- MCP does not choose a different artifact contract.
- MCP does not hide degraded runs; status and result tools must expose them.

## Provider Selection

Providers are selected by capability and user/runtime configuration.

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

## First Implementation Slice

1. Export a TS core API facade from `src/core-api/`.
2. Keep the existing CLI path working.
3. Add MCP schemas from `src/mcp/tool-schemas.ts`.
4. Add a local/mock provider that satisfies `src/providers/capability-contract.ts`.
5. Write conformance tests against generated review artifacts.
