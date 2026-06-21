# Handoff — M1 conservation implemented; cross-review near-clean; next = P1-b refinement + bounded follow-ons

> `/clear` resume point. The reconstruct silent-defect track pivoted from reactive per-round patching to a **root-cause structural remediation** (the "conservation" design). M1 (the core) is implemented + pushed; this handoff carries the M1 cross-review result and the remaining work.

## 0. Location / env
- cwd `/Users/kangmin/cowork/onto-mcp-claude`. Branch **`feat/reconstruct-silent-defect-fixes`** = PR **#97** (base `main` = `f3be736`). Working tree clean except untracked session artifacts (`.onto/review/*`, `development-records/...`).
- HEAD = **`c64bed3`** (M1). PR #97 already carries #21/#1/#22/#2 + 6 codex rounds + the codex-round fixes; M1 is the latest commit.
- Live (`onto_reconstruct`, ultracode, onto_review, codex CLI) all available. **⚠️ Claude API hit a transient "Server is temporarily limiting requests" rate limit during the M1 ultracode review — retry later.**

## 1. The big arc (why we're here)
codex reviewed PR #97 for **7 rounds without converging** — each round found a deeper variant of the prior fix. Root-cause workflow (`wf_e740c3a4-4d3`, archived `development-records/design/20260619-reconstruct-silent-defect-rootcause-analysis.json`) found it is **structurally guaranteed**: every reconstruct stage trusts the artifact it's handed and only checks present records resolve; **no stage derives the closed expected set from the upstream authority and asserts conservation**. So round count = chain length, not fix quality. The 3 highest-severity P1s were never fixed in 7 rounds.

**Decision (user): scope reduction.** Land the bounded, deterministic core (M1) now; defer the two hard legs (M4b, G obligation-coverage) to focused follow-ups; split secret/sensitive filtering to its own opt-in track.

## 2. Design (triple cross-validated)
- **Track 1 (this work)**: `development-records/design/20260619-reconstruct-conservation-structural-remediation-design.md` (**v4**). M1 conservation + M2 budget + M4 revision + G governance + M3a capture-size + M3c snapshot. Cross-validated onto + ultracode + codex-CLI, then re-validated (onto 2 medium / ultracode needs_revision); user chose scope reduction → **M1 only first**.
- **Track 2 (separate, owner-defined)**: `development-records/design/20260619-deterministic-sensitive-data-source-safety-preprocessing-design.md`. Deterministic blacklist preprocessing for **clear-cut secrets** (NOT fuzzy PII): secret-bearing files + 주민등록번호(checksum)/SSN(validation logic)/passport/card(Luhn)+CVC/declared id-pw. opt-in default-off, file-level exclude + content-level validated-value redaction, audited in source-safety ledger. **Scope boundary = deterministic-detectability + exploit value, NOT is-it-personal.** Detailed design pending owner go-ahead.

## 3. ✅ M1 implemented (`c64bed3`) — deterministic, no LLM
`src/core-runtime/reconstruct/maturation-validation.ts`. Closes the P1 trio:
- **P1-a** `validateMaturationBaseline`: `deriveExpectedBaselineTuples(selected)` enumerates the closed `(element × actionability_surface_refs × maturity_dimension_refs)` set (same as the builder) → diff present-row tuples: missing → `missing_required_coverage`, duplicate tuple → `conflicting_state`. Coverage authority = the TUPLE (not slug `baseline_row_id`).
- **P1-b** `validateActionabilityMatrix`: every baseline row → exactly one matrix row (drop → `missing_required_coverage`); each matrix row → exactly one baseline ref; inherited identity/lineage fields preserved (mutate → `conflicting_state`). Helper `sameRefSet`.
- **P1-c** `validateMaturationContinuationDecision`: recompute included/excluded partition from the matrix (closed→included, non-closed→excluded), require `claim_scope` to match (omit → `conflicting_state`). **No baseline threading needed** (the matrix it already has suffices — the v4 re-review's over-scope concern).
- Tests: P1 duals (delete/dup/drop/mutate/omit all FAIL). **reconstruct 638 · full vitest 1631 · guards OK · zero regression.**

## 4. M1 cross-review result (the immediate next action)
- **codex CLI** (`codex review --commit c64bed3`): **CLEAN** — "did not find a discrete correctness issue introduced by this commit."
- **onto** (`.onto/review/20260620-1504c306`, noDomain, 6/6 lenses): **1 medium, 0 high/blocker.** Finding (P1-b): the identity-equality check is incomplete in two ways —
  1. `sameRefSet` is **set-equality (ignores multiplicity)** → a matrix that replaces a duplicate occurrence in a duplicate-bearing member-lineage ref (e.g. `[a,a,b]`→`[a,b,b]`, same length+set) passes. Use **exact/multiplicity-sensitive array equality** for the copied ref arrays.
  2. **`competency_question_refs` + `competency_assessment_refs` are baseline-COPIED (immutable) in `buildActionabilityMatrixArtifact` but NOT asserted** — add them to the inherited-equal set. (The v4 re-review told me to EXCLUDE competency_*_refs; onto reviewing the actual code shows they're copied → INCLUDE them. Trust onto/the code.)
  - Action: add competency_question_refs + competency_assessment_refs to the immutable equal set; replace `sameRefSet` with exact array equality for the copied identity/lineage/competency fields; add tests (duplicate-lineage change + competency-ref tamper → `conflicting_state`).
- **ultracode** (`wf_ce144204-ac2`): Review phase produced **22 issues / 5 material**, but the **Verify + Synthesize phases were rate-limited** (Claude transient throttle) → `confirmed=[]`, `synthesis=null`. The 5 material are UNVERIFIED Review-phase findings (likely overlap onto's medium; may include false positives). **Re-run to verify when the rate limit clears**: `Workflow({scriptPath: ".../workflows/scripts/m1-impl-review-wf_ce144204-ac2.js", resumeFromRunId: "wf_ce144204-ac2"})` (the Review agents are cached → only Verify/Synthesize re-run).

## 5. Next steps (in order)
1. **Apply the onto P1-b refinement** (competency refs + exact equality + tests) → commit → re-verify (re-run the ultracode resume; quick onto re-review optional).
2. **Continue the bounded Track-1 scope** (each its own commit, verified): **M2** (evidence budget — keep BOTH `EVIDENCE_EXCERPT_LIMIT` and `EVIDENCE_CANDIDATE_LIMIT`; derive the reserve = `PROMPT_CHAR_LIMIT − measuredNonEvidence − margin` with the pinned build order; keep the 50K terminal halt) → **M4a** (run.ts: `isRevisionBlocker` consistent at stop+disclosure, all non-reuse disclosure, target_id sanitize) → **M3a/c** (per-kind capture-size policy shared with materialize-preparation.ts; canonical seed-stage snapshot artifact).
3. **PR**: M1+bounded pieces are on PR #97. Decide with user whether to keep on #97 or split. `@codex review` after pushing; user-confirm before squash merge.
4. **Verify M1's stricter validation against the live emergence backbone** (`.onto/reconstruct/20260619-9ac56418`) before merge (stricter validation could surface on rich input).

## 6. Deferred follow-up tracks (do NOT fold into M1)
- **M4b** (continuation `actionable_ready` gating on unresolved revision proposals): the round-7 finding. ⚠️ **Do NOT reuse `candidate_limitation_refs`** (it's the purpose-candidate authority; M1 asserts candidate↔baseline EQUAL → injecting revision blockers breaks it). Use a dedicated `revision_blocker_limitation_refs` derived from **`revision-proposal.yaml`** (the validation artifact carries only counts — wrong source), added to the continuation-validator input authority, AND added to the conservation chain (it is itself a new carried field = a new un-guarded hop otherwise). Builder must also downgrade decision_state.
- **G obligation-coverage gate**: ⚠️ `loadReconstructContractRegistry` currently **drops `validation_obligations`** → a loader-based gate is vacuous until the loader/types are extended. A static `obligation_id→handle` map is just another declared-only table; need validators to RECORD `asserted_obligation_ids` (dynamic proof) and bound the gated set (P1+#22 enforced; ~531 active obligations make the unbounded gate red-on-day-one). The G loader-preservation + field-parity (`prompt_projection_contracts` registry node) + append-section registry model parts are the lighter, landable pieces.
- **M1.5 mixed-lineage tightening**: ⚠️ row-only narrowing would **regress codex-R3-2** (limitation_backed candidate justifying a mixed-lineage gap). Needs a structured candidate-limitation→row-lineage binding first. DEFERRED.
- **Track 2 sensitive-data** preprocessing (above).

## 7. Verification loop (per piece)
implement → `check:ts-core` + `npx vitest run src/core-runtime/reconstruct/...` (+ maturation/run) + guards (`check:import-boundary/spec-defaults/invariant-drift`) + full `test:vitest` → commit (**explicit paths only, no `git add -A`** — many untracked session artifacts) → push (⚠️ network has been flaky; retry loop) → `@codex review`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01XEVmF9jJXPF8Mps9P4h3sU`.

## 8. Memory
`contract-runtime-gap-ledger` (root cause + design + M1 + deferred tracks + the refined source-safety boundary), `effort-calibration-track`. Both updated.
