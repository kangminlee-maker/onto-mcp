# Deferred-7 obligation telemetry — RESUME handoff

> # ✅ TRACK COMPLETE (2026-06-24) — deferred-7 7/7. Nothing left to resume here.
> All 5 stages MERGED: Stage 0 #145 · Stage 1 #147 · Stage 2 #148 · Stage 3 #149 · Stage 4 #150 · Stage 5 #152.
> main HEAD `c2b9c41`. Final coverage **272 = 110 recorded + 162 parked**. Across 26 distinct obligations
> audited, **8 recorded**, 18 honestly parked (declared≠fully-wired, per-obligation ledger notes). The
> semantic/snapshot validator PARK-heavy outcome matched the design prediction. ⚠️ Stage 5 (#152): codex
> workspace was deactivated → **ultracode multi-perspective review substituted** (owner-approved, CLEAN, 0/18
> confirmed). The detail below is retained as the historical track record; no further slices.

**Goal**: instrument the 7 reuse-hashed / scout-captured validators Track A deferred, now SAFE via Stage 0.
User authorized **autonomous track progress** (merge each slice on codex-clean + CI green; refresh this
handoff + memory each merge; compact at ~80% context). Design SSOT:
`development-records/design/20260623-deferred7-obligation-telemetry-design.md` (Option A approved).

## ⚡ ON RESUME (after /clear) — DO THIS FIRST
- **✅ Stage 0 MERGED = PR #145 (main `b54b661`; codex R1 clean "Breezy").** `asserted_obligation_ids` is now
  in-memory-only: persisting it is impossible (stripped at the write boundary `atomicWriteYamlDocument` and
  excluded from `reuseMatchArtifactHash` via `stripVolatileArtifactFields`). So instrumenting any of the 7
  no longer rotates reuse provenance — proven by the byte-invariance tests (artifact-io.test.ts channel-2 +
  run.test.ts channel-1 `reuseMatchArtifactHash` seam).
- **Stages 1-4 ALL MERGED** (#147/#148/#149/#150). **NEXT = Stage 5 = scout-pack family (LAST)** — see
  "Current state" below for the live pointer. 3 validator_ids (`source-scout-pack` + `source-scout-pack-pre-seed`
  + `source-scout-pack-post-maturation`, 5 obl each) share ONE fn `validateSourceScoutPack` in
  `src/core-runtime/reconstruct/source-scout-pack-validation.ts` → needs per-call-site / mode-aware stamping
  (Track-A slice-3 matrix-dual precedent; watch for a registry-absent (validator_id, obligation_id) pair). BOTH
  reuse channels apply (reuseMatchArtifactHash + scout `sha256File` raw-file); Stage 0 #145 neutralized both.
  Carry the Stage-4 codex edges: gated-on-optional-arg over-claim + duplicate-key Map collapse + slice-3 null-read.

## Per-slice ROUTINE (same as Track A + a byte-invariance assertion)
1. Branch off origin/main: `feat/deferred7-slice<N>-<name>`. (★`git checkout --detach origin/main` first.)
2. SAFETY is now satisfied for ALL 7 by Stage 0 — but still grep-confirm the validation artifact's reuse
   exposure (`reuseMatchArtifactHash`/`sha256File`) so the byte-invariance test targets the right channel.
3. Read the fn; map each registered obligation → enforcement site (contract clause, not id).
4. Independent `Explore` audit (ENFORCED/PARTIAL/NOT_FOUND/AMBIGUOUS per obligation). RECORD only name-matching
   ENFORCED that FULLY enforce the named scope; PARK the rest with `note:`. (Track-A lessons all apply:
   shared-mechanism non-isolation, presence-only, projection-only, gated-on-optional-arg, scope-discriminator,
   DELEGATED, override-conservative-audit-only-when-contract-verbatim.)
5. Edits: `artifact-types.ts` add `asserted_obligation_ids: string[];` before `violations:`; validator fn
   `const assertedObligationIds: string[] = [];` + `assertObligation(...)` per recorded obligation BEFORE any
   per-row guard (fire on zero-row); emit `asserted_obligation_ids: assertedObligationIds,` before `violations`.
   `obligation-coverage-recorded.yaml` add pairs; `obligation-coverage-ledger.yaml` remove recorded + add notes.
   harvest test: `run<Validator>()` helper + `.toContain` + add to FRESHNESS (spread + bump `toBe(<N>)`).
6. **Byte-invariance assertion (NEW for this track)**: the harvest/own-test already exercises the validator;
   the Stage-0 channel tests are global. For each slice, confirm the slice's persisted artifact still omits
   the field (covered globally by atomicWriteYamlDocument) — no per-slice infra needed, but cite Stage 0 in
   the PR. (The real proof the field doesn't rotate reuse is Stage 0's two tests; don't re-derive per slice.)
7. Verify: `check:ts-core`; obligation harvest vitest; `tsx scripts/check-obligation-coverage.ts origin/main`
   (272 = recorded+parked); the validator's own `.test.ts`; `tsx scripts/check-invariant-drift.ts origin/main`
   (G1-G10 no_drift); flip-test (perl-replace a stamp → harvest reds → restore); full `vitest run`.
8. Commit with **explicit file paths only** (never `git add -A` — sweeps untracked benchmark/handoff files).
9. PR (base main) + `@codex review`. Poll BOTH `pulls/N/reviews` commit_id AND `issues/N/comments` (codex bot,
   "Reviewed commit: <head>"); network flaky → retry. Converge; merge (authorized) `gh pr merge N --squash`.
10. Cleanup (main is checked out in another worktree → `--delete-branch` local step fails): `git fetch origin
    main; git checkout --detach origin/main; git branch -D <branch>; git push origin --delete <branch>`.
11. Refresh memory `contract-runtime-gap-ledger` + this handoff "Current state".

## Track queue (smallest first; scout-pack family LAST = mode-dual)
`source-safety-ledger`(5, Stage 1, scouted) · `source-scout-pack`(5)+`pre-seed`(5)+`post-maturation`(5) [3
validator_ids share ONE fn `validateSourceScoutPack` → per-call-site / mode-aware stamping like Track-A
slice-3 matrix-dual; do these as ONE slice or careful sequence, LAST] · `target-material-profile`(6) ·
`source-observation-lineage-index`(7) · `seed-authoring-readiness`(8). Total parked across the 7 = 41.

## Current state (refresh each merge)
- main HEAD `b8b855a` (**Stage 4 #150 MERGED**, codex R1[2 P2 → 3→1]→R2 clean "More of your lovely PRs please").
  recorded **107/272**, parked 165, deferred-7 **4/7**. **NEXT = Stage 5 = scout-pack family (LAST)** — 3
  validator_ids (`source-scout-pack` + `source-scout-pack-pre-seed` + `source-scout-pack-post-maturation`,
  5 obl each = 15) share ONE fn `validateSourceScoutPack` → per-call-site / mode-aware stamping like Track-A
  slice-3 matrix-dual. Reuse channels BOTH (run.ts source_scout_pack_validation_sha256 reuseMatchArtifactHash
  + scout `sha256File` raw-file) → Stage 0 neutralized both. Do as ONE careful slice/sequence. Run the ROUTINE.
- Done: Stage 0 #145 · Stage 1 #147 (src-safety, 3/5) · Stage 2 #148 (target-mat-profile, 2/6) · Stage 3 #149
  (lineage-index, 1/7, codex forced 6→1) · **Stage 4 #150 (seed-authoring-readiness, 1/8, codex forced 3→1)**.
- **Stage 4 = seed-authoring-readiness RECORD 1** (`validate_blocked_validation_gap_is_projection_not_semantic_
  decision` → readiness_classification_mismatch; UNCONDITIONAL single-scalar recompute-compare) / **PARK 7**.
  ⚠️ squash title says "(3 of 8)" (stale pre-codex PR title) — actual recorded is **1 of 8**; recorded.yaml is
  the truth. This validator takes parsed objects + recompute-and-compares (no file I/O) → slice-3 null-read does
  NOT apply, but TWO new codex edges parked the other 2 RECORD candidates:
  - **gated-on-optional-arg** (consumes_pre_seed_snapshot): the 3 source_scout_pre_seed_identity_mismatch checks
    are conditional on the optional sourceScoutPackValidationRef/Validation; an unconditional top stamp over-
    claims for gap-only runs (absent snapshot → validation-gap branch, not identity check). ★carries to scout-pack.
  - **duplicate-key Map collapse** (required_elements_have_closure_rows): expected/actual closure rows are Map-
    keyed by required_element_ref, so duplicate element_ids (not rejected upstream) collapse → one row satisfies
    both, missing-duplicate uncaught. ★AUDIT any "every X has a row/ref" obligation keyed by an id-Map.
- **★PROCESS LESSON (Stage 4)**: the flip-test's `git checkout -- <file>` reverted my **unstaged** validator
  edits to HEAD (origin/main) — had to re-apply all 3. For the flip-test: `git add` the slice files first (then
  checkout restores from index), OR `cp` a backup. Never `git checkout --` an unstaged file you still need.
- **★CRITICAL LESSON (Stage 3, apply to Stages 4+)**: validators with runtime YAML reads (`readYamlDocument`)
  have a **null-read false-pass** — an existing EMPTY file parses to `null` WITHOUT throwing, so a try/catch
  `*_missing` guard never fires AND any `if (artifact) {...}` check is skipped → the row passes valid. Also a
  **caller-supplied authority** gap — a "X exists in Y" check against a PASSED object is unenforced unless the
  object is bound to the chain's authoritative ref. AUDIT BOTH before recording any "X readable/valid/exists/
  matches" obligation on these snapshot/lineage validators (seed-authoring-readiness + scout-pack likely have
  the same edges → expect PARK-heavy).
- Stage 1 = source-safety-ledger **RECORD 3** (exactly-four-axes · subject-refs-resolve · visibility-tier-derived
  [contract-override: derive-check gated on valid enum but complement independently rejected, codex accepted])
  / PARK 2 (consumption-boundaries=overlapping; **every-observation-rows = codex P1 weak proxy** — required-row
  check proves the `source_safety:<obs>:<consumption>` ID STRING present but never binds that suffix to the
  row's `visibility_derivation.intended_consumption`, so a mismatched-derivation row passes). ⚠️ squash title
  says "4 of 5" (stale pre-fix PR title) — actual is 3 of 5; recorded.yaml is the truth.
- ★**codex lesson (carry to remaining slices)**: for these source-safety/snapshot validators, an ID-string /
  presence check is a WEAK PROXY unless it binds the encoded discriminator to the row's semantic field. Audit
  each "every X has rows/refs" obligation for the ID↔field binding before recording.
- ★base-lag note: origin/main keeps advancing via unrelated docs PRs (#144 P0.5, #146 stage2-shardability) — on
  each slice, after committing, check `git rev-list --count HEAD..origin/main`; if >0 `git rebase origin/main`
  + `git push --force-with-lease`. Verify `git diff origin/main --stat` = only the slice's files.
- **deferred-7 remaining = 1** (scout-pack family 3×5 = `validateSourceScoutPack`, Stage 5 LAST, mode-dual).
  After it: track complete (PARK-heavy confirmed — Stages 1-4 recorded only 7 of 26 audited = src-safety 3,
  target-mat 2, lineage 1, seed-authoring 1; the rest honestly parked as declared≠fully-wired).

## Stage 5 scout-pack scouting (done 2026-06-24, not yet implemented — START HERE next)
- **fn** `validateSourceScoutPack` @ `src/core-runtime/reconstruct/source-scout-pack-validation.ts:537` (async,
  979-line file). Writers/registry: 3 validator_records @ registry `:2110` (base), `:2127` (pre-seed), `:2145`
  (post-maturation). 15 obligations = 9 DISTINCT ids (several shared across the 3 modes):
  - **shared ×3**: `validate_prompt_visible_rows_have_source_safety_validation_refs` ·
    `validate_signal_rows_resolve_to_source_observations`.
  - **shared pre-seed+post-maturation**: `validate_snapshot_lineage_validation_ref_and_hash_match_current_
    lineage_authority` · `validate_snapshot_scope_derives_from_target_material_profile_validation`.
  - **base-only**: `validate_scout_pack_is_profile_local_and_contains_no_selected_purpose_required_element_refs`
    (→ validateNoSelectedPurposeLeak @592) · `validate_scout_scope_derives_from_target_material_profile_
    validation` (NOTE: base says "scout_scope", pre/post say "snapshot_scope" = DIFFERENT ids, likely SAME
    underlying scope check → scope-discriminator audit) · `validate_group_and_coverage_refs_resolve`.
  - **pre-seed-only**: `validate_pre_seed_scout_snapshot_is_immutable_consumed_authority`.
  - **post-maturation-only**: `validate_post_maturation_scout_snapshot_is_immutable_audit_authority`.
- **★MODE-DUAL UNSOLVED**: the fn has **NO `mode`/kind arg** — base/pre-seed/post-maturation are NOT
  distinguished by a parameter. Before any stamping, TRACE the discriminator (likely the scout_pack ref
  basename `.pre-seed.yaml`/`.post-maturation.yaml`/`.yaml`, or a `scout_pack_kind` field on the artifact, or
  which gate invokes the writer). slice-3 matrix-dual precedent = harvest calls the fn once PER mode and
  attributes each call's asserted_obligation_ids to the right validator_id; here that's 3 calls → 3 validator_ids.
  If the fn can't tell its mode internally, the mode-specific obligations (immutable_consumed vs immutable_audit;
  scout_scope vs snapshot_scope) CANNOT be stamped per-validator without a mode arg or a registry-absent pair →
  this is the design's flagged "scout-pack-shared-fn cannot stamp three validator_ids" redesign trigger. Resolve
  the discriminator FIRST; if none exists, consider adding a mode arg (smallest viable) or PARK the mode-specific ones.
- **Reuse channels BOTH** (#145 Stage 0 neutralized both): reuseMatchArtifactHash (run.ts:1227) + scout
  `sha256File` raw-file (this file @147 returns null for missing). **Heavy async file reads** → slice-3
  **null-read false-pass** applies in force (sha256File(null)=null; input_snapshot_hashes?.x !== null edges).
  Audit every hash/ref-match obligation for null-read AND caller-supplied-authority before recording.
- Expect PARK-heavy. The two unconditional, robust candidates to check first: signal_rows-resolve
  (signal_observation_missing @744-752, unconditional per-row) and prompt-visible-safety-refs (signal_safety_
  row_missing @768-785, binds to expected prompt_context safety row id) — but confirm they're not null-read/
  caller-authority gated, and decide which validator_id owns the shared ones (or stamp under all 3 if each mode
  genuinely runs the same enforced check).

## SAFETY note (why the 7 were unsafe, now resolved)
Two reuse channels keyed off persisted/​in-memory bytes: (1) `reuseMatchArtifactHash` over the in-memory
validation object (run.ts authoredArtifactReuseMatch ~1188-1230); (2) scout-pack `sha256File` over the raw
validation file (source-scout-pack-validation.ts ~599-607). Stage 0 neutralized both by never letting
`asserted_obligation_ids` reach disk (channel 2) and excluding it from the in-memory digest (channel 1).
