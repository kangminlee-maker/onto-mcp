# 2026-06-04 Reconstruct Actor-Action-State Implementation Completion

> Status: Complete for the 1-12 implementation goal in this thread
> Scope: reconstruct actor-action-state-first seeding, pre-seed readiness, bounded recovery, prompt compaction, and live E2E stabilization
> Canonical design: `development-records/plans/20260603-reconstruct-actor-action-state-scout-design.md`
> Active runtime seat: `.onto/processes/reconstruct/` plus `src/core-runtime/reconstruct/`

## Goal Result

The reconstruct implementation now follows the actor-action-state-first seeding
design while preserving the LLM/runtime ownership boundary:

- Runtime creates and validates `source-scout-pack.yaml` as a profile-local,
  source-safety-filtered exploration priority projection.
- Runtime creates and validates `seed-authoring-readiness.yaml` before seed
  authoring, but its deterministic gate scope is explicitly limited to
  `pre_seed_closure_only`.
- Semantic ontology adequacy remains owned by seed authoring and downstream
  validators.
- First source frontier receives actor/action/state gap candidates and may be
  runtime-augmented with up to three unobserved inventory refs only when the
  authored frontier is empty.
- Source sufficiency and max-round exhaustion are separated by explicit
  `source_sufficiency_state`, `exploration_budget_state`, and
  `max_round_exhaustion_interpretation` fields.
- Ontology-domain category rows are diagnostic unless a selected-purpose closure
  row resolves to that category.
- Seed validation failure runs a focused repair loop instead of re-opening broad
  exploration.
- Provider timeout recovery is bounded:
  source-purpose retries a minimal LLM kernel, seed authoring retries a minimal
  kernel and may then project a deterministic seed from already validated
  upstream LLM-authored authorities, and competency-question timeout recovery
  projects coverage questions for validator review.
- Claim realization and competency-question prompts use compact seed/claim
  projections rather than the full seed artifact.

## Live Evidence

Representative live reconstruct run:

```text
/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-reconstruct-live-pFaHHw/.onto/reconstruct/live-small
```

Artifact evidence:

- `reconstruct-record.yaml`: `record_stage: completed`
- `reconstruct-run-manifest.post-publication-validation.yaml`: valid
- `competency-questions-validation.yaml`: valid
- `claim-projection-validation.yaml`: valid
- `maturation-continuation-decision-validation.yaml`: valid, with
  `decision_state: blocked`

The blocked maturation decision is expected for this evidence set. The pipeline
completed honestly without projecting `actionable_ready`.

## Verification

Latest verification on 2026-06-04:

```text
git diff --check
npx tsc -p tsconfig.json --noEmit
npx vitest run src/core-runtime/reconstruct/*.test.ts
npm run test:mcp:review
```

Results:

- TypeScript check passed.
- Reconstruct tests passed: 22 files, 204 tests.
- MCP review conformance passed and produced `.onto/review/20260604-b6315810`.

## Remaining Follow-Up

The next major work should target prompt input/output size efficiency across the
post-seed path. The current implementation has compacted the major source,
selected-purpose, seed, claim, and CQ prompt projections enough for live E2E
completion, but live provider calls can still exceed 50k input tokens after the
seed is available.

Recommended next focus:

- chunk or narrow post-seed maturation/CQ assessment prompts;
- keep deterministic projections as runtime views over validated authorities;
- avoid adding new semantic gate authority to runtime while optimizing prompts;
- repeat live E2E on a real repository after the next compaction pass.
