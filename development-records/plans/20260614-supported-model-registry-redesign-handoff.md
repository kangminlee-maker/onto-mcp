# Supported-model registry (INV-MODEL-1) — redesign record

> Status: **redesign complete; ready to re-gate.** PR #54 OPEN.
> Date: 2026-06-14
> Worktree `/Users/kangmin/cowork/onto-mcp-models`, branch `feat/supported-model-registry`
> (off main `2ae6e9a`). `node_modules` is symlinked from the main checkout.

## Goal (user directive)

`settings.json` may only select LLM models whose support a **benchmark verified** (a benchmark
record shows the model completing a pipeline run). Authority document + settings enforcement.
Approach: **human-curated authority registry citing benchmark evidence** (not an auto threshold).

## Final design (what shipped on this branch)

- `.onto/authority/supported-models.yaml` — curated registry, seeded `openai/gpt-5.5` citing
  `development-records/benchmark/reconstruct-pipeline-live-20260613.json`. Shipped with the install,
  located from the **install root** (walk up from `import.meta.url`, same resolver as
  `core-lens-registry.yaml`).
- `src/core-runtime/discovery/supported-models.ts` — `loadSupportedModelRegistry()` (no arg,
  **strict**: the authority always ships, so a missing/malformed file is an installation error, not a
  skip), `collectModelSelections` (recursive seat finder), `assertSupportedModelRoutes` (membership
  over EFFECTIVE `(provider, model)` routes; a route whose provider is unresolved is rejected
  fail-loud).
- `src/core-runtime/discovery/settings-chain.ts` —
  - `collectEffectiveModelRoutes(settings)`: resolves the runtime-effective `(provider, model)` per
    seat, inheriting a provider-less review-unit override's provider from its default actor (mirrors
    the runtime's unit→actor inheritance), so the inherited pair is validated, not a lenient
    model-only match.
  - `assertSettingsModelsSupported(settings)`: the **standalone gate** — the one validator both the
    runtime and the G7 guard call (they cannot diverge). Throws `OntoSettingsValidationError`
    (reason `settings_unsupported_model`).
  - `resolveSettingsChain` is a **pure projection** — it does NOT enforce the model gate.
- Enforcement points (gate ≠ projection):
  - **Runtime**: `core-api/reconstruct-api.ts` calls `assertSettingsModelsSupported(settings)` only
    on the **live path** (`!mockRealizationEnabled`) — the gate is about real (paid) model calls,
    mock realization makes none and is exempt.
  - **CI (G7)**: `scripts/check-supported-models.ts` validates the committed `.onto/settings.json`
    (all seats, review + reconstruct) via `assertSettingsModelsSupported`, parsing with the YAML
    parser the runtime uses (comment-tolerant). Registered in `scripts/check-invariant-drift.ts`
    and `.github/workflows/invariants.yml`.
- `INVARIANTS.md` — `INV-MODEL-1` + G7 row.
- `src/core-runtime/discovery/supported-models.test.ts` — 9 tests (selections, effective-route
  inheritance, route membership, standalone gate pass/throw).

## How the 4 gate findings were resolved

onto (session `20260614-d26d3155`): material 4. Codex: P1 + P2 + P3.

1. **P1 — load the authority from the install root, not `projectRoot`.** Done via walk-up from
   `import.meta.url` (lens-registry pattern); loader is strict/always-present, which also dissolves
   **issue-003** (absence-vs-read-error ambiguity disappears).
2. **issue-001 / issue-002 — validate the runtime-EFFECTIVE route.** Done via
   `collectEffectiveModelRoutes`: a provider-less review-unit override inherits its default actor's
   provider before membership is checked; unresolved-provider routes fail loud.
3. **P3 — guard parser parity.** `check-supported-models.ts` parses with the YAML parser; it routes
   through the same `assertSettingsModelsSupported` the runtime uses.
4. **P2 — register G7 in `check-invariant-drift.ts`.** Done.

## Correction to the prior handoff (why the design moved)

The prior note claimed strict-always-present loading had **zero blast radius** ("every
settings-resolving test uses only gpt-5.5"). That was **wrong**: embedding the gate inside
`resolveSettingsChain` made every settings resolution enforce, and the review/cli/materializer/
resolution-mechanics tests resolve settings with diverse fixture models (e.g.
`anthropic/claude-sonnet-4-6`) — **112 tests** broke. Root cause was a concept error: a **gate** was
fused into a shared **projection**. Fix: keep resolution pure; make the gate a standalone called at
the live-execution boundary (real spending) + the G7 CI guard. All 1022 tests pass; all guards green.

Scope note (deliberate): runtime enforcement is wired on the **reconstruct** live path (this
optimization track's pipeline). The review live path's runtime enforcement is a noted follow-up; the
review seats in the committed config are already covered by G7.

## Verify + gate (per-lever process)

- `npm run check:ts-core`; `npx vitest run`; guards: `check:import-boundary`, `check:spec-defaults`,
  `check:invariant-drift`, `check:invariant-change`, `check:supported-models`. (Done — all green.)
- onto gate: `onto_review` with `projectRoot=/Users/kangmin/cowork/onto-mcp-models`,
  `diffRange=main...HEAD`, `reviewMode=core-axis`, `domain=software-engineering`; require
  material-issue-0.
- Codex: `@codex review` on PR #54; bot login `chatgpt-codex-connector[bot]` (slow on new PRs).
- AGENTS.md §0 rule 2 (settings.json schema/contract change → user confirmation) is satisfied by the
  original directive; the contract (only benchmark-verified models selectable; reason
  `settings_unsupported_model`) is unchanged — only the enforcement *location* moved.
