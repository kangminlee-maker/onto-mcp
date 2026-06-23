# Deferred-7 obligation-coverage telemetry — design

**Status**: DESIGN — **scope APPROVED = Option A** (owner, 2026-06-23). Not implemented. Remaining gate before
build: §8 cross-validation (run ultracode+onto, or proceed under the Stage-0 byte-invariance hard gate).
**Date**: 2026-06-23. **Author context**: continues G(a) Track A (obligation-coverage) after slice 28 / PR #143.

## 1. Goal & completion criteria

Instrument the **7 reuse-hashed / scout-captured validators** that Track A deliberately deferred, so their
registered `validation_obligation`s can be RECORDED (or honestly PARKED) like the other 27 — **without
rotating any reuse-provenance hash** (the slice-6 / PR #115 failure mode).

The 7 (each currently `recorded=0`):

| validator | parked | reuse channel |
|---|---|---|
| target-material-profile | 6 | `target_material_profile_validation_sha256 = reuseMatchArtifactHash(...)` (run.ts ~1188) + scout `sha256File` |
| source-safety-ledger | 5 | `source_safety_ledger_validation_sha256` (run.ts ~1214) + scout `sha256File` |
| source-observation-lineage-index | 7 | `source_observation_lineage_index_validation_sha256` (run.ts ~1223) + scout `sha256File` |
| seed-authoring-readiness | 8 | `seed_authoring_readiness_validation_sha256` (run.ts ~1227) |
| source-scout-pack | 5 | `source_scout_pack_validation_sha256` (run.ts ~1220) |
| source-scout-pack-pre-seed | 5 | shares `ReconstructSourceScoutPackValidationArtifact` (one fn `validateSourceScoutPack`) |
| source-scout-pack-post-maturation | 5 | shares the same artifact |

**Done when**: each of the 7 validators is audited; recordable obligations stamped + in `recorded.yaml`;
non-recordable obligations PARKED with audit notes; `check:obligation-coverage` still `272 = recorded+parked`;
**every reuse-provenance fingerprint is byte-identical to today** (proven by test); full vitest green;
no resume migration required.

## 2. The constraint, precisely

`asserted_obligation_ids` is stamped by `assertObligation(acc, id)` and emitted on the validation artifact.
For the 27 safe validators this is harmless because their validation artifacts feed **no** reuse hash.

The 7 are different — their persisted validation bytes feed reuse provenance through **two** channels, and
**both key off the persisted bytes**:

1. **Content hash** — `reuseMatchArtifactHash(value) = sha256(stableJson(stripVolatileArtifactFields(value)))`.
   `stripVolatileArtifactFields` removes only `created_at` / `emitted_at` (run.ts:1067-1070). Any new field
   (`asserted_obligation_ids`) changes the hash → `AuthoredArtifactReuseMatch` fingerprint rotates → resume
   re-authors everything.
2. **Raw-file hash** — `source-scout-pack-validation.ts` captures `sha256File(<validation>.yaml)` of the
   **raw file bytes** (lines 599-607) into `input_snapshot_hashes`. This is why PR #115 found that *stripping
   the field from `reuseMatchArtifactHash` alone is insufficient*: the scout snapshot still embeds the raw-byte
   hash of the file, so a persisted field rotates the scout-pack artifact transitively (and trips the scout
   validator's `input_snapshot` mismatch check).

**Therefore the only robust invariant is: the persisted validation-file bytes must not change.**

## 3. Key insight (capability-boundary framing)

`asserted_obligation_ids` is a **runtime-owned, in-memory telemetry** field, not artifact truth:

- It is deterministic (a function of validator control-flow), not LLM-authored.
- **It has no disk consumer.** Verified: the only readers are the harvest test (reads the validator's
  in-memory return value) and the checked-in `obligation-coverage-recorded.yaml`/`-ledger.yaml` (a separate
  SSOT, not the artifact). No code reads `asserted_obligation_ids` from a parsed artifact; no golden/fixture
  YAML contains it.

Per `llm-capability-boundary.md` ("keep internal projections internal unless public exposure is required";
"assign each field one primary authority"): a telemetry field whose only consumer is in-memory **should not be
persisted at all**. Persisting it today is an incidental side effect of serializing the whole artifact, not a
contract. Removing it from persistence is a concept-surface *reduction*, and it makes the 7 safe for free
(unchanged bytes → no hash rotation, on either channel, with **zero resume migration**).

## 4. Options

All three keep the harvest working (it reads the in-memory return). They differ in scope/mechanism.

### Option A — uniform in-memory-only via one write-boundary strip (RECOMMENDED)
Strip `asserted_obligation_ids` at the single shared validation-write path so **no** validation artifact ever
persists it. Then instrument the 7 with the normal slice routine.
- **Mechanism**: one strip point (a thin `writeValidationArtifact`/strip helper, or strip the single key in the
  shared atomic YAML writer used by validation writers). The 27 safe validators' *code* is untouched; their
  persisted output simply loses a field nobody reads.
- **Pro**: uniform (one class of validation artifact), principled, **net concept-surface reduction**, robust
  (bytes unchanged on both channels), zero resume migration, the 7 then instrument exactly like slices 1-28.
- **Con**: changes the persisted shape of all ~27 merged validators' artifacts (verified safe: no consumer, no
  golden). "Type has the field but the writer omits it" is slightly implicit → mitigate with a drift test.
- **Risk**: medium-low (broad but mechanical, bounded by the verified "no disk consumer" fact).

### Option B — scoped strip (only the 7)
Only the 7 reuse-hashed validators strip the field on persist; the 27 keep persisting it.
- **Pro**: minimal blast radius (merged 27 untouched).
- **Con**: asymmetric concept (some validation artifacts persist the field, some don't); a reader can't rely on
  "validation artifacts carry `asserted_obligation_ids`". Two code paths to remember.
- **Risk**: low.

### Option C — separate telemetry from the artifact return
Validators return `{ artifact, assertedObligationIds }`; the artifact **type** drops the field.
- **Pro**: cleanest type model (telemetry ≠ artifact, no implicit writer strip).
- **Con**: largest refactor — changes the return signature of all 27+7 validators, every run.ts call site, and
  the harvest aggregation. High churn on merged code.
- **Risk**: medium-high.

### Rejected: strip-in-reuse-hash-only (the #115 attempt)
Add `asserted_obligation_ids` to `stripVolatileArtifactFields` and keep persisting. **Insufficient** — the scout
snapshot's `sha256File` still hashes the raw bytes (channel 2). Making the scout hash a stripped projection
would change its semantics (raw-file → projected) and rotate every existing scout hash once. Discard.

## 5. Recommendation — ✅ APPROVED: Option A (owner, 2026-06-23)

**Option A**, implemented via the lowest-surface mechanism (one strip point + a drift guard).

Rationale: it satisfies the capability-boundary principle (don't persist unconsumed telemetry), keeps a single
uniform validation-artifact concept, requires **no** edit to the 27 merged validators' logic, needs **no**
resume migration, and is the only option that neutralizes *both* reuse channels by construction (the bytes
never change). Option B is the fallback if the owner prefers zero change to already-merged persisted output.

## 6. Concept-economy analysis

- **Net surface change**: *reduction* — removes a never-consumed persisted projection (`asserted_obligation_ids`)
  from validation artifacts; adds the field to 7 validator return types (already an established pattern); adds
  one strip helper + one drift test. No new artifact, enum, gate vocabulary, or persisted field.
- **Authority vs visibility**: the obligation-coverage SSOT stays `recorded.yaml` + `ledger.yaml`; the harvest
  re-derives it from in-memory validator execution. Persistence of the telemetry was never part of that authority.
- **Reuse**: reuses `assertObligation`, the slice routine, `stripVolatileArtifactFields`'s "volatile field"
  notion (now extended conceptually to "non-persisted telemetry").

## 7. Implementation-process plan (when approved)

Ordered, each with its own verification + review gate. Per-validator slices mirror the proven Track-A routine.

1. **Stage 0 — write-boundary strip + drift guard** (Option A core). Add the single strip point; add a test that
   a representative validation artifact's persisted YAML does **not** contain `asserted_obligation_ids` while the
   validator's in-memory return **does**. Verify: `check:ts-core`, full vitest, and a **reuse-fingerprint
   invariance test** — author one of the 7 artifacts with and without a stamp and assert `reuseMatchArtifactHash`
   + `sha256File` are byte-identical. **Gate**: this stage must prove byte-invariance before any of the 7 is
   touched.
2. **Stage 1..7 — instrument each of the 7** (one slice each, smallest first by obligation count; scout-pack
   family last since 3 validator_ids share one fn → needs per-call-site / mode-aware stamping like slice 3's
   matrix-dual). Each slice: SAFETY re-confirm (now safe via Stage 0) → independent Explore audit → RECORD only
   name-matching ENFORCED, PARK the rest with notes → field + stamp + emit + `recorded.yaml`/`ledger.yaml` +
   harvest helper + freshness bump → `check:ts-core` + `check:obligation-coverage` + `check:invariant-drift` +
   the validator's own `.test.ts` + flip-test + **fingerprint-invariance test** + full vitest → explicit-path
   commit → codex round → merge.
3. **Stage 8 — close-out**: refresh the Track-A handoff + memory; confirm `272 = recorded + parked` with the new
   recorded count; note any obligations that stay PARKED as honest declared≠wired (owner disposition input).

**Redesign triggers** (stop & ask): if Stage 0 cannot prove byte-invariance for any of the 7 (e.g. a hidden
consumer surfaces); if the scout-pack-shared-fn cannot stamp three validator_ids without a registry-absent pair;
if a validator's persisted output turns out to have a golden/E2E consumer after all.

## 8. Cross-validation & risks

- **Cross-validation gate**: this is a sensitive slice (touches reuse provenance — the exact thing #115 broke).
  Per `[[design-validation-ultracode-onto]]`, run an **ultracode + onto self-review of this design** before
  Stage 0. ⚠️ The effort-calibration memory notes a **monthly-spend limit** may block live workflows/onto review;
  if so, fall back to a careful subagent review + the byte-invariance test as the hard gate.
- **Risks**: (a) a hidden disk consumer of the field (mitigated: grep clean + Stage-0 gate); (b) scout-pack
  mode-dual stamping creating a registry-absent pair (mitigated: slice-3 precedent + reverse-validation gate);
  (c) the 7 are mostly *semantic/structural-snapshot* validators → expect PARK-heavy honest results, like the
  other semantic validators (that is success, not failure).
- **Out of scope**: actually WIRING the parked obligations (a separate, heavier owner-gated track); Track 2
  sensitive-data; the parked-172 disposition.

## 9. Open questions for the owner

1. Scope: **Option A (uniform, recommended)** vs Option B (scoped-7) vs Option C (separated return)?
2. Run the ultracode+onto cross-validation now, or proceed under the byte-invariance hard gate if budget blocks it?
3. Is removing the never-consumed persisted `asserted_obligation_ids` from the 27 already-merged artifacts
   acceptable (Option A), or must merged persisted output stay byte-stable (forces Option B)?
