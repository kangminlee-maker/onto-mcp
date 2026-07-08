# Handoff — G-tractable governance parity (loader + G(b)) — `/clear` resume

> ✅ **DONE (2026-06-22): PR #108 squash MERGED to main `44fc4d0`.** onto self-review (1 medium, resolved) + implementation + codex 5-round convergence (all G8-guard robustness; core logic unchallenged) + verify (full vitest 1766, G1–G8 no_drift) + branch/worktree cleanup + memory update all complete. **Remaining deferred legs (own PRs/designs): G(c) append-sections (spec in the design §3.3), G(a) obligation-coverage (asserted_obligation_ids substrate), M1.5 lineage binding, Track 2 sensitive-data, matrix artifact-self binding.** This file is now historical.

> Continues the reconstruct conservation track. M1·#100·#101·M2/M4a/M3a(#104)·M3c(#106)·M4b(#107) all MERGED to main. This is the **G** (governance) track. **Scope (owner-decided, after ultracode cross-validation): THIS PR = Part 1 loader extension + Part 2 G(b) field-parity. G(c) append-sections is SPLIT to its own follow-up PR. G(a) obligation-coverage stays DEFERRED.**
> **THE next concrete action: run the onto self-review on the (already ultracode-validated + revised) design, reflect, then implement.** Design is fully specced; implementation NOT started.

## 0. Location / state
- cwd `/Users/kangmin/cowork/onto-mcp-claude`. Branch **`feat/conservation-g-tractable`** off main **`14f19d7`** (M4b #107). **No commits yet.** Working tree: only untracked files (design note, tracking json, this handoff, pre-existing benchmark fixtures).
- ⚠️ `main` is checked out in another worktree (`onto-mcp-spreadsheet`) — after a future merge, `git checkout --detach origin/main` here to delete the local branch (same as #104/#106/#107). Other local branches `feat/spreadsheet-*` are unrelated — don't touch.
- ⚠️ Network/gh flaky (TLS) — retry gh in a loop. codex posts as `chatgpt-codex-connector`: a **review** (621-char boilerplate body; real findings are inline review-thread comments via GraphQL `reviewThreads`, NOT the flaky `/pulls/N/comments` REST) when it has findings, OR an issue **comment** "Didn't find any major issues" when clean. Latency ~7-12 min.

## 1. Spec (durable)
- **Design (START-HERE for the build): `development-records/design/20260622-g-tractable-governance-parity-design.md`** — fully revised to this scope, with all cross-validation resolutions folded into §3.1 (loader), §3.2 (G(b)); §3.3 holds the DEFERRED G(c) spec for its own PR.
- **ultracode findings (durable): `development-records/tracking/20260622-g-tractable-xval-findings.json`** — `wf_bb8e5698-0ff`, 40 material → **34 confirmed (10 high)**. (The /tmp workflow output is ephemeral; this json is the record.)
- Parent design: `development-records/design/20260619-reconstruct-conservation-structural-remediation-design.md` v4 §3 G.

## 2. ⏳ Next step: onto self-review (the cross-validation is half-done)
Hard-slice pattern = ultracode + onto before build. **ultracode DONE; onto PENDING.** Run:
`onto_review({ target: "development-records/design/20260622-g-tractable-governance-parity-design.md", intent: "...verify loader snapshot-projection fix soundness, G(b) field-parity completeness, SSOT/authority fit, concept economy...", reviewMode: "core-axis", noDomain: true })` → returns a running handle → poll `onto_review_read({latest:true, projectionLevel:"standard"})` until terminal → read `finding-ledger.yaml` in the session dir for findings (the synthesis can lag; lens findings land first). Reflect any material findings into the design, then implement. (M4b precedent: onto core-axis ≈ 5 mediums, codex_cli OAuth gpt-5.5 subscription route.)

## 3. Implementation plan (after onto) — exact sites
**Part 1 — loader extension** (`src/core-runtime/reconstruct/contract-registry.ts`):
- `ReconstructValidatorRecord` type += `validation_obligations: string[]` + `conditional_validation_obligations: ConditionalValidationObligation[]`; new type `ConditionalValidationObligation = { obligation_id: string; activation_condition: string; input_authority_refs: string[] }`.
- `parseValidatorRecord` (~703-709) parses both (optional; default `[]`) + a `parseConditionalValidationObligation` helper. Real conditional rows: registry lines ~2245-2249 / 2304-2313 / 2701-2705. Leave `conditional_input_authority_refs` (separate field, ~2283-2292) OUT (documented).
- **DECISIVE (xval #1 HIGH)**: do NOT let obligations rotate the governing-snapshot/reuse hash. In `governing-snapshot.ts` the `validator_records` family (~575-581) embeds the WHOLE record and hashes it (~445); that flows to `authoredArtifactReuseMatch.governing_snapshot_sha256` (run.ts:1262). **Project validator_records to the existing 5 fields (strip the 2 new) BEFORE the snapshot family**, mirroring `validator_versions` projection (~546-553). Verify governing-snapshot.test.ts + reuse-provenance tests: family sha UNCHANGED.
- No coverage gate (that's G(a)).

**Part 2 — G(b) field-parity**:
- Extract `competencyQuestionAssessmentProjectionContract()` + its budget constants (run.ts ~786-855) into a new module `src/core-runtime/reconstruct/competency-projection-contract.ts`; run.ts re-imports. (xval #17/#21/#27: do NOT export from 13k-line run.ts / import run.ts in a script.)
- Registry node `prompt_projection_contracts.competency_question_assessment` = `{payload_fields:[14 top-level keys], policy_fields:[batching_policy keys: mode/order/build_budget_reserve_chars/single_question_overflow], budget_fields:{prompt_char_limit:50000, source_evidence_excerpt_char_limit:4000, build_budget_reserve_chars:1000}}`. (xval #33: NO candidate_limit — not in contract output.)
- New guard `scripts/check-prompt-projection-parity.ts`: import registry node + the extracted module; assert exact-set equality (payload/policy keys) + budget equality; `process.exit(1)` on drift. Register in `scripts/check-invariant-drift.ts` `GUARDS` ({guard,invariants,command}). INV id: decide `INV-REGISTRY-PARITY-1` (INVARIANTS.md + invariants.yml + INVARIANT-CHANGE marker — extra scope) vs map to existing (xval #28/#32).
- Tests: loader test (obligations present + snapshot sha unchanged); G(b) guard negative test (add/drop field/budget → fail).

## 4. Verification loop
`npm run check:ts-core` → targeted `npx vitest run src/core-runtime/reconstruct/contract-registry*.test.ts src/core-runtime/reconstruct/governing-snapshot.test.ts src/core-runtime/reconstruct/run.test.ts` (+ any registry-verification test) → run the new guard script directly → guards (`check:import-boundary`/`check:spec-defaults`/`check:invariant-drift`) → full `npm run test:vitest` (baseline **1747**). Commit explicit paths only (untracked benchmark fixtures present). Trailers: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_016s7b1AKZSiY1gd3LJSBzY4`.

## 5. After implement
1. Commit (loader + G(b), its own commit) + push, PR base main, `@codex review` (reply summarizing scope + that G(c)/G(a) are split/deferred).
2. Converge codex rounds (expect the binding/registration/exact-set class). When clean → **user-confirm → squash merge + branch cleanup** (detach to origin/main, delete local+remote; untracked benchmark fixtures may block detach — they're tracked via earlier records, remove identical untracked copies then detach).
3. Update memory `contract-runtime-gap-ledger` (G-tractable MERGED) + this handoff.

## 6. Then the deferred legs (separate PRs, NOT here)
- **G(c)** append-sections reconciliation — spec ready in the design §3.3 (8 sections, parity-guard-not-derive, alias map, heading parity, unresolved-revision section-id). Own PR.
- **G(a)** obligation-coverage dynamic proof (the 301-obligation `asserted_obligation_ids` substrate) — needs its own design.
- **M1.5** lineage binding · **Track 2** deterministic sensitive-data preprocessing · matrix artifact-self binding residual (`development-records/handoff/20260621-matrix-validator-cross-artifact-binding-followup.md`).

## 7. Memory
`contract-runtime-gap-ledger` (updated through M4b #107) + `design-validation-ultracode-onto` (hard-slice pattern). This handoff is the G-tractable START-HERE.
