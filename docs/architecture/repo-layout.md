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
| `.onto/principles/` | rank 2–4 development norm documents (shipped in the npm package via the `files` allowlist) |
| `.onto/domains/` | selectable domain documents and domain-specific profiles |
| `.onto/processes/shared/` | cross-process target and runtime contracts |
| `.onto/processes/review/` | review contracts |
| `.onto/processes/reconstruct/` | reconstruct contracts, contract registry, source profiles |
| `.onto/processes/evolve/` | future evolve material-kind adapter contract (no active runtime or MCP tool yet) |
| `.onto/roles/` | review lens and synthesize role definitions |
| `src/core-runtime/` | executable review/reconstruct runtime |
| `src/core-api/` | Core API facade called by MCP and repository harnesses |
| `src/mcp/` | MCP tool schemas and server entrypoint |
| `scripts/` | repository-local verification, conformance, and benchmark harnesses |
| `docs/architecture/` | current architecture, continuation, operational notes |
| `docs/decisions/` | accepted direction and architecture decisions |
| `benchmark/` | **gitignored** working area where `scripts/` harnesses dump raw probe output. Nothing durable lives here — a probe writes everything, including what nobody will read again |
| `evidence/` | execution records an **active** document cites as its grounds. Active runtime may point here; [evidence/README.md](../../evidence/README.md) owns what qualifies and how a record is promoted |
| `development-records/` | development history, audits, designs, handoff records — outside the authority hierarchy; `development-records/archive/` isolates retired CLI/process/learning/govern/evolve material; `development-records/benchmark/` is the tracked home for probe output an **isolated** document cites (see its `PROVENANCE-promoted.md`) |
| `IMPLEMENTATION_MAP.html` | visual architecture and roadmap dashboard |

`.onto/review/*` and `.onto/reconstruct/*` are execution session outputs, not
source. Exclude them from runtime naming, code audits, docs audits, and
migration searches unless the task is about session artifacts themselves.

## Active runtime does not point into history

Active runtime — tracked sources under `src/`, `.onto/`, and `docs/` — must not
reference a file inside `development-records/`. Naming the folder is describing
the repo's shape and stays allowed; naming a file inside it sends a reader into
a superseded design that reads as current fact. `README.md`, `AGENTS.md`, and
`CLAUDE.md` are exempt: their job is to say where history lives.

### Where a cited record lives

A probe writes to the gitignored `benchmark/`, and **a document may only cite a
record that has been promoted out of it.** Which destination depends on who is
citing — that is the whole of the rule:

| Citing document | Destination | Why |
|---|---|---|
| isolated — a design note, handoff, or backlog entry under `development-records/` | `development-records/benchmark/<name>/` | history citing history. The record is a fact about the moment that design was written |
| active — runtime code comments, `.onto/` contracts, `docs/`, and the maps | `evidence/` | an authority's grounds are not history. If the grounds sat in the isolated tree, the rule would forbid an authority from citing its own basis |

Promotion is deliberate in both directions: `development-records/benchmark/PROVENANCE-promoted.md`
records what came out of the working area, and [evidence/README.md](../../evidence/README.md)
records what an active document cites. A record whose last active citer
disappears goes back to `development-records/benchmark/`.

`scripts/check-doc-currency.sh` (`npm run check:doc-currency`, CI gate G13)
enforces the active row and the rule that every repo document path an active
file names exists on disk. The isolated row is not machine-checked — history
citing history harms nobody.

## src/core-runtime internal structure

```text
src/core-runtime/
├── cli/              review bounded step entrypoints, invocation runner, provider unit executors
├── discovery/        settings chain, onto home, lens registry, host detection
├── llm/              provider/model switcher + LLM call wrappers
├── observability/    runtime event stream + watcher attach
├── onboard/          host registration (`onto register`)
├── reconstruct/      reconstruct runtime: run control, gates, maturation loop
├── release-channel/  release channel notice
├── review/           review artifact types, materializers, deliberation, route policy
├── artifact-io.ts    shared atomic artifact writes (tmp+rename)
├── logger.ts         shared logger
├── path-boundary.ts  path containment guard
├── pipeline-execution-ledger.ts  shared execution ledger core
└── target-material-kind.ts       target material classification
```

- `review/` owns the productized review semantics: context-isolated lenses,
  controlled deliberation, synthesize, and the `ReviewRecord`.
- `reconstruct/` owns the reconstruct runtime semantics behind the gate
  catalog in the reconstruct contract registry.
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
