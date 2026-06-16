# Workflow TUI Design — `onto watch`

> Status: Design fixed (2026-06-16). Implementation track on `feat/tui-watch`.
> Decision context: a terminal workflow UI to observe onto-mcp review/reconstruct
> sessions live, inspired by the ouroboros TUI + Claude Code `/workflows`.

## 1. Goal & scope

A terminal TUI (`onto watch [session]`) that renders a **live, navigable view of a
review or reconstruct workflow** — **observe-only** in v1 — by consuming onto-mcp's
existing event stream + projections, with the runtime remaining the sole authority.

- In scope: live pipeline progress, per-unit/stage status, findings/answerability,
  telemetry, runtime event log, session selection. Both pipelines first-class.
- Out of scope (v1): control actions (cancel/continue/advance) — deferred to a
  later "drive" track; run-control state is displayed, not actionable.

## 2. Key insight — onto-mcp already owns the data & projection layer

onto-mcp already has (a) an append-only event stream
(`runtime-events.ndjson` via `appendRuntimeStreamEventSync`), and (b) **render-oriented
projections** designed for a host to render: review's `getReviewStatus` →
`llmPresentation.progress` (unit_progress, liveness, result_classification, run_control),
and reconstruct's `getRunStatus` → `ReconstructSessionStatus.progress`
(`ReconstructRunProgressProjection`: stages, owner, countSummary, answerability).

The MCP host (Claude) is currently the "renderer" of these projections. **A workflow UI
is just another renderer of the same contract** — so it needs no new data plumbing.
The work is a **pure view (+ later a thin control client)** over the existing stream +
projections.

## 3. Three-reference convergence

| Element | ouroboros TUI | CC `/workflows` | onto-mcp (already has) |
|---|---|---|---|
| primary view | `ac_tree` (status icons, incremental) | phase-grouped live tree | `unit_progress[]` grouped by `progressStepId` |
| node data | status·label | label·status | `publicAlias`·`status`·`secondsSinceLatestSignal`·`attemptCount`·`failureMessage` |
| fan-out | `parallel_graph` | parallel/pipeline | lens parallel → barrier → deliberation |
| top line | header | narrator (`log()`) | `latest_update.summary` / `liveness.summary` |
| cost | `cost_tracker` | subagent_tokens | manifest steps `provider_tokens_in/out` |
| run model | EventStore subscribe | background + reattach | `returnRunningAfterMs` → handle → `read(latest)` poll |

All three converge on a **phase/step-grouped live tree of units, with status icon +
label + liveness + a narrator line, over a background run you reattach to**. onto-mcp's
projection already carries the exact node fields; `onto watch` IS onto-mcp's reattach.

## 4. Architecture — pipeline-agnostic `TreeViewModel` + two adapters

```
reviewProjection ───────────────────→ reviewAdapter ──────┐
reconstructProjection + manifest ─┐                        ├─→ TreeViewModel ─→ Ink HUD
runtime-events.ndjson ────────────┴─→ reconstructAdapter ─┘    (pipeline-agnostic)
```

review and reconstruct expose progress in **different shapes** (review = per-UNIT live
signal; reconstruct = per-STAGE state + owner + domain counts). The normalization layer —
a common `TreeViewModel` fed by two adapters — is what makes reconstruct first-class. The
HUD renders only `TreeViewModel`; pipeline differences live in the adapters and optional
view-model fields.

```ts
interface TreeViewModel {
  pipeline: "review" | "reconstruct";
  sessionId: string;
  status: "running" | "completed" | "halted" | "failed";
  liveness: { state: string; secondsSinceSignal: number | null; pollMs: number | null };
  narrator: string;
  phases: Phase[];
  summary: { findings?: SeverityCounts & { material: string[] };
             counts?: Record<string, number | null> };  // one or the other
  runControl: { cancellable: boolean; continuable: boolean; advanceable?: boolean };
}
interface Phase { id: string; label: string; state: NodeState; nodes: Node[]; }
interface Node {
  id: string; label: string; status: NodeState; kind: string;
  owner?: string; signalAgeSec?: number | null; attempts?: number;
  failureMessage?: string | null; outputPath?: string | null;
}
type NodeState = "pending" | "running" | "completed" | "failed" | "halted" | "skipped";
```

- **reviewAdapter**: groups `unit_progress[]` by `progressStepId`; nodes carry live signal.
- **reconstructAdapter**: joins `stages[]` (state·owner·authorityImpact) + `manifest.steps`
  (telemetry) + the event tail (live signal); footer = countSummary + answerability.

## 5. Screens (3) + key mockups

- **SessionSelector** (no arg) — list `.onto/{review,reconstruct}/*` with status·liveness.
- **WorkflowTree HUD** (primary) — narrator + phase-grouped unit tree + drill-down detail +
  findings/cost footer + run_control (display-only).
- **Log** — `runtime-events.ndjson` live tail (filter by stage/source).

```
┌─ onto watch · review · 20260616-62411f81 ───────────── ● live ─┐
│ "judge LLM config 리뷰…"            route codex/gpt-5.5
│ ▸ isolated lens execution — 3 running · 1s since last signal
├────────────────────────────────────────────────────────────────┤
│ Pipeline  ▰▰▱▱▱▱▱▱▱▱▱▱  2/12  isolated lens execution
│ ✓ manifest validation
│ ◐ isolated lens execution                       ⌁ 6 lenses
│   ├─ ◐ lens:axiology    running  1s  ·try1
│   ├─ ◐ lens:coverage    running  2s
│   └─ ○ lens:logic       pending
│ ○ finding ledger → issue ledger → deliberation → record
├────────────────────────────────────────────────────────────────┤
│ Findings ⬤0 blk ⬤0 high ⬤0 med ⬤0 low      Tokens 12.6k↑ 1.2k↓
│ Run-control  cancel ✓ available
├────────────────────────────────────────────────────────────────┤
│ [q]uit [tab] log [↑↓] select [enter] drill [r]efresh
└────────────────────────────────────────────────────────────────┘
```

reconstruct renders the same chrome; `stages` are the nodes (owner column), and the footer
is `CQ N · supported · deferred · unsupported` (answerability) instead of finding severity.
Other states (completed / halted / failed) reuse the same frame with terminal/halt markers.

## 6. Module layout (`src/tui/`, consumes core-api; parallel to `src/mcp/`)

```
src/tui/
├── index.ts                  # `onto watch` entry: args · session pick · mount
├── view-model/               # ── pure TS (no JSX) ──
│   ├── tree-view-model.ts    # TreeViewModel types
│   ├── review-adapter.ts     # ReviewStatus → TreeViewModel
│   ├── reconstruct-adapter.ts# ReconstructSessionStatus(+events) → TreeViewModel
│   └── *.test.ts
├── data/                     # ── pure TS ──
│   ├── session-discovery.ts  # list .onto/{review,reconstruct}/*
│   ├── projection-poll.ts    # poll getReviewStatus/getRunStatus, respect interval
│   └── event-follower.ts     # tail runtime-events.ndjson (async iterator)
├── app.tsx                   # ── TSX (Stage B+) ── Ink App: routing · keys · state
├── screens/  workflow-tree.tsx · session-selector.tsx · log.tsx
└── widgets/  phase-progress.tsx · unit-tree.tsx · footer.tsx · liveness.tsx
```

- CLI wiring (`src/cli.ts`): `case "watch": { const { runWatch } = await import("./tui/index.js"); return runWatch(argv.slice(1)); }` (matches the existing dynamic-import dispatch).
- Boundary: `tui/` imports **core-api only**. `runtimeStreamEventLogPath` + `RuntimeStreamEvent`
  are re-exported via core-api so the TUI has a single dependency; `check-import-boundary.ts`
  gets a `tui/` rule.
- `view-model/` + `data/` are pure TS → Stage A needs **zero build change**; JSX arrives at Stage B.

## 7. Data / control flow

```
projection-poll ─(getReviewStatus|getRunStatus)→ adapter → TreeViewModel ─┐
                                                                          ├→ Ink <App> (React reconcile = incremental)
event-follower  ─(ndjson tail)──────────────────→ narrator·log·signal ────┘
```

Poll interval respects the projection's `poll_after_seconds` / `recommendedPollIntervalMs`.
React reconciliation replaces ouroboros's manual node_map. Terminal states stop polling.

## 8. Dependencies & build

| Item | Decision |
|---|---|
| new deps | `ink` · `react` · `ink-spinner` (+ `@types/react`) → **dependencies** (shipped) |
| tsconfig | add `jsx: "react-jsx"` (Stage B; affects `.tsx` only) |
| vitest | esbuild handles `.tsx`; Stage A logic is pure TS so unaffected |
| dist/bin | `.tsx` → `dist/tui/*.js`; `onto watch` runs dist; `files` already ships `dist/` |
| weight | ink+react add runtime weight — observe-only, no authority impact (tradeoff noted) |

## 9. Staged implementation plan

| Stage | Work | Gate | Build change |
|---|---|---|---|
| **A. read-path (pure TS)** | TreeViewModel · review/reconstruct adapters · event-follower · session-discovery · core-api re-export · import-boundary rule | typecheck · **adapter unit tests (review + reconstruct fixtures → correct TreeViewModel)** · check:import-boundary | 0 |
| **B. minimal HUD (TSX)** | tsconfig jsx + deps + `onto watch` wiring + Ink App + WorkflowTree (tree+narrator+footer) | build (tsc+dist) · live render vs real/fixture session · **both pipelines** · q quits · import-boundary | jsx · deps |
| **C. screens** | Log tail · SessionSelector · drill-down · nav · state branches (completed/halted/failed/no-session) | nav · drill · live · state branches | — |
| **D. polish + review loop** | resize · edge · self/subagent review | material → 0 | — |
| (later E) | drive: cancel/continue/advance via run-control | control-path tests · authority via run-control | — |

## 10. Concept economy & authority

- New concepts: `src/tui/` layer · `onto watch` subcommand · `TreeViewModel` + 2 adapters ·
  event-follower · Ink components. (One view-model + two adapters absorbs both pipelines —
  minimal surface.)
- Reuse: `getReviewStatus`/`getRunStatus` projections · `runtime-events.ndjson` + path helper ·
  session listing.
- Authority untouched: read-only consumer — never writes session artifacts or mutates run
  state. Control (later E) routes through existing run-control (runtime stays authority).

## 11. Risks & redesign triggers

- TSX build setup (mitigated: Stage A is pure TS, proves the logic before any build change).
- Dependency weight (ink+react in the shipped runtime).
- Projection field gaps → additive core-api projection addition (flagged), not a TUI-side hack.
- reconstruct live signal insufficiency from the event tail → reconsider stage-telemetry join.
- Terminal raw-mode incompatibility → non-raw fallback.
