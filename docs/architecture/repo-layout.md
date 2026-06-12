# Repository Layout

This document is the repo-layout SSOT: folder roles, runtime-internal
structure, and placement rules live here. `AGENTS.md`, `CLAUDE.md`, and
`docs/development.md` reference this file instead of restating it.

This repository is the TS-first home for the MCP-native `onto-mcp` runtime.
The active runtime lives here and must run without reaching into another
`onto` checkout.

## Top-level layout

| Path | Role |
|---|---|
| `.onto/authority/` | concept SSOT (`core-lexicon.yaml`), runtime-facing lens registry, diagnostic code registry |
| `.onto/principles/` | rank 2–4 development norm documents (not shipped) |
| `.onto/domains/` | selectable domain documents and domain-specific profiles |
| `.onto/processes/shared/` | cross-process target and runtime contracts |
| `.onto/processes/review/` | review contracts |
| `.onto/processes/reconstruct/` | reconstruct contracts, contract registry, source profiles |
| `.onto/roles/` | review lens and synthesize role definitions |
| `src/core-runtime/` | executable review/reconstruct runtime |
| `src/core-api/` | Core API facade called by MCP and repository harnesses |
| `src/mcp/` | MCP tool schemas and server entrypoint |
| `scripts/` | repository-local verification, conformance, and benchmark harnesses |
| `docs/architecture/` | current architecture, continuation, operational notes |
| `docs/decisions/` | accepted direction and architecture decisions |
| `development-records/` | development history, audits, designs, handoff records — outside the authority hierarchy; `development-records/archive/` isolates retired CLI/process/learning/govern/evolve material |
| `IMPLEMENTATION_MAP.html` | visual architecture and roadmap dashboard |

`.onto/review/*` and `.onto/reconstruct/*` are execution session outputs, not
source. Exclude them from runtime naming, code audits, docs audits, and
migration searches unless the task is about session artifacts themselves.

## src/core-runtime internal structure

```text
src/core-runtime/
├── cli/          review bounded step entrypoints + provider unit executors
├── discovery/    settings chain, onto home, lens registry, host detection
├── llm/          provider/model switcher + LLM call wrappers
├── review/       review artifact types, materializers, deliberation, route policy
└── logger.ts     shared logger
```

- `review/` owns the productized review semantics: context-isolated lenses,
  controlled deliberation, synthesize, and the `ReviewRecord`.
- `llm/` is the runtime boundary that simplifies API-key / OAuth / local
  provider selection.

## Placement rules

- Product semantics go in `.onto/` contracts and `src/core-runtime/`.
- Cross-process process contracts live under `.onto/processes/shared/`.
- Future process contracts should follow the folder shape already used by
  review, for example `.onto/processes/reconstruct/`, rather than reviving
  archived root-level process files.
- Cross-process target handling must classify the target by material form
  (`target_material_kind`: code, spreadsheet, document, database, mixed, or
  unknown) before choosing adapters or validation behavior.
- Tool-call UX goes in `src/mcp/`.
- Provider-specific execution stays in bounded runtime adapters under
  `src/core-runtime/cli` and `src/core-runtime/llm` until a separate provider
  layer is justified by distinct ownership.
- Layering direction: `cli/` (execution layer) imports `review/` (semantic
  layer), never the reverse. The invocation entry surface
  (`cli/review-invocation-runner.ts`: prepare/run orchestration plus the CLI
  wrappers) lives in `cli/` and consumes `cli/review-invoke.js` setup helpers
  one-directionally.
- External host integration should be treated as provider evidence, not the
  canonical `onto` implementation.
