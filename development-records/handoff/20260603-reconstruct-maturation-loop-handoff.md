# 2026-06-03 Reconstruct Maturation Loop Handoff

> Status: Active handoff
> Branch: `feat/reconstruct-maturation-loop`
> Current HEAD before this dirty work: `7d1fe24 Merge pull request #14 from kangminlee-maker/feat/settings-v3-actor-llm`
> Purpose: allow a new session to continue the reconstruct seeding/maturation implementation without needing the full prior conversation.

## 1. Product Memory

The current product direction for `reconstruct` is:

```text
source material
  -> source-derived purpose
  -> first valid kernel of an actionable ontology
  -> maturation loop toward an actionable ontology
```

The user has been explicit about these constraints:

- `reconstruct` must not become a runtime-only ontology generator.
- The host LLM authors semantic artifacts; runtime owns validation gates, artifact truth, and fail-loud boundaries.
- Mock-backed paths are acceptable for tests/fixtures, but do not count as product completion.
- Fail-loud is preferred over compatibility shims or smooth-looking mock completion.
- `compat_projection` is not an acceptable legacy handling strategy.
- Active runtime docs must not keep obsolete concepts in execution-facing paths.
- The ontology target is actionable: static, kinetic, and dynamic surfaces must all be represented.
- `seed` is not itself decision/action-ready. Seeding and maturation are distinct stages.

Current reconstruct naming:

- **Seeding**: produces the first valid kernel of an actionable ontology.
- **Maturation**: expands that seed until it can support action/decision use within a declared claim scope.

## 2. Current Dirty Work Summary

The current working tree contains uncommitted reconstruct maturation changes.

The main implemented slice is a first-pass M1-M4 maturation refinement:

1. Runtime now recomputes `actionability-matrix.yaml` after validated answer claims and ontology expansion.
2. `blocker` / `high` rows cannot silently close unless they reach `L4_validated_for_purpose` or are explicitly limitation-backed outside claim scope.
3. `continue` decisions now require concrete unresolved next frontier refs; accepted source requests alone are not enough.
4. A major artifact-truth issue was found and patched:

```text
Before:
  actionability-matrix.yaml was used as the M2 question-frontier input,
  then overwritten after answer claims / ontology expansion.
  This made question-frontier refs point at a changed artifact.

After:
  baseline-actionability-matrix.yaml is the immutable baseline matrix for M2.
  actionability-matrix.yaml is the current/final matrix recomputed after M3/M4.
```

This split is now reflected in:

- stage ids
- run manifest steps
- pipeline execution ledger topology
- artifact refs / record boundary
- contract registry artifact authority and gate catalog
- README
- IMPLEMENTATION_MAP
- reconstruct design document

## 3. Files Currently Modified

Expected dirty files before this handoff file was added:

```text
.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md
.onto/processes/reconstruct/reconstruct-contract-registry.yaml
IMPLEMENTATION_MAP.html
README.md
src/core-runtime/reconstruct/artifact-types.ts
src/core-runtime/reconstruct/maturation-validation.test.ts
src/core-runtime/reconstruct/maturation-validation.ts
src/core-runtime/reconstruct/pipeline-execution-ledger.test.ts
src/core-runtime/reconstruct/pipeline-execution-ledger.ts
src/core-runtime/reconstruct/record.ts
src/core-runtime/reconstruct/run-control-validation.test.ts
src/core-runtime/reconstruct/run.test.ts
src/core-runtime/reconstruct/run.ts
```

After this handoff is created, also expect:

```text
development-records/handoff/20260603-reconstruct-maturation-loop-handoff.md
```

## 4. Important Implementation Details

### Baseline vs Current Actionability Matrix

Current intended sequence:

```text
maturation-baseline.yaml
  -> maturation-baseline-validation.yaml
  -> baseline-actionability-matrix.yaml
  -> baseline-actionability-matrix-validation.yaml
  -> maturation-question-frontier.yaml
  -> maturation-question-frontier-validation.yaml
  -> maturation-closure-frontier.yaml
  -> answer-support-ledger.yaml
  -> maturation-answer-claims.yaml
  -> ontology-expansion.yaml
  -> actionability-matrix.yaml
  -> actionability-matrix-validation.yaml
  -> maturation-convergence-ledger.yaml
  -> maturation-continuation-decision.yaml
```

Key code seats:

- `src/core-runtime/reconstruct/artifact-types.ts`
  - `RECONSTRUCT_STAGE_IDS` now includes `baseline_actionability_matrix` and validation before question frontier.
  - `actionability_matrix` and validation now sit after `ontology_expansion_validation`.
- `src/core-runtime/reconstruct/pipeline-execution-ledger.ts`
  - `maturation_question_frontier` depends on `baseline_actionability_matrix_validation`.
  - current `actionability_matrix` depends on baseline validation, answer-claims validation, and ontology-expansion validation.
- `src/core-runtime/reconstruct/run.ts`
  - writes `baseline-actionability-matrix.yaml` before question frontier.
  - recomputes `actionability-matrix.yaml` after answer claims and ontology expansion.
- `.onto/processes/reconstruct/reconstruct-contract-registry.yaml`
  - adds `baseline_actionability_matrix_gate`.
  - adds `baseline-actionability-matrix-validator`.
  - changes `maturation-question-frontier-validator` to consume `baseline-actionability-matrix-validation.yaml`.

### Matrix Maturity Behavior

Implemented behavior in `maturation-validation.ts`:

- Baseline rows start from `maturation-baseline.yaml`.
- Validated answer claims can raise a matching row to `L3_evidenced`.
- Validated answer claims plus ontology expansion can raise a matching row to `L4_validated_for_purpose`.
- Blocker/high rows remain frontier-required unless L4 or limitation-backed.
- Validation rejects maturity regression, unsupported L3/L4 upgrades, and hidden material rows.

### Continuation Decision

Current behavior:

- `actionable_ready` is still withheld because final re-question convergence is not implemented.
- If all material rows are closed but final re-question is `not_run`, current first-pass projection may be `actionable_limited`.
- `continue` requires `next_frontier_refs`.
- Source requests alone no longer justify `continue`.

## 5. Verification Already Run

These passed after the latest changes:

```bash
npx vitest run src/core-runtime/reconstruct src/core-api/reconstruct-api.test.ts src/core-runtime/discovery/settings-chain.test.ts
npm run check:ts-core
npm run build:ts-core
npx vitest run
git diff --check
```

Observed summaries:

```text
reconstruct/core-api/settings-chain focused vitest:
  Test Files 21 passed
  Tests 197 passed

full vitest:
  Test Files 55 passed
  Tests 522 passed

TypeScript check:
  passed

TypeScript build:
  passed

git diff --check:
  passed
```

## 6. Remaining Work

Recommended immediate next work:

1. Review this handoff and run `git status --short --branch`.
2. Inspect the current diff for accidental broadening.
3. Run a real repository E2E reconstruct test against the previously used target:

```text
https://github.com/day1co/day1co-ai-usage-dashboard
```

Do not treat mock-authored success as enough for product completion.

After E2E:

- inspect produced `ontology-seed.yaml`
- inspect `baseline-actionability-matrix.yaml`
- inspect final/current `actionability-matrix.yaml`
- verify `maturation-question-frontier.yaml` refs the baseline matrix, not the current matrix
- verify `maturation-continuation-decision.yaml` does not overclaim `actionable_ready`
- verify final output explains limitations truthfully

If E2E is acceptable:

```bash
npm run check:ts-core
npm run build:ts-core
npx vitest run
git diff --check
```

Then commit the current slice.

## 7. Known Planned Follow-Up Surfaces

These are not closed by the current dirty work:

- final re-question generation
- maturation source-delta authority
- proof authorities for query / visualization / graph / API / runtime proof surfaces
- promoted resume protocol
- durable multi-round maturation execution beyond the current first-pass projection
- real-provider conformance beyond local deterministic tests

Current first-pass implementation intentionally records final re-question as `not_run`.
That is why `actionable_ready` must remain withheld.

## 8. Suggested New-Session Opening Prompt

Use this if starting a new Codex session:

```text
Read development-records/handoff/20260603-reconstruct-maturation-loop-handoff.md.
Continue on branch feat/reconstruct-maturation-loop.
First inspect git status and current diff.
Do not discard dirty changes.
Verify that baseline-actionability-matrix and current actionability-matrix are separated in stage ids, manifest, pipeline ledger, registry, and docs.
Then run a real reconstruct E2E against https://github.com/day1co/day1co-ai-usage-dashboard and report whether the first-pass maturation artifact truth holds.
```

