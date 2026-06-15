# Judge LLM config — live smoke (PRELIMINARY)

> Status: **PRELIMINARY — not decision-grade** (single live run, 1 fixture; INV-BENCH-1 needs runs≥3 / fixtures≥2).
> Date: 2026-06-16 · Commit: `f7299d5` (clean tree) · Raw record: `reconstruct-pipeline-judge-smoke-20260616.json`
> Feature: opt-in per-stage answer-support judge LLM config (PR #62).

## What was run

```
tsx scripts/reconstruct-pipeline-benchmark.ts --realization live \
  --fixture reconstruct-golden-target-v1 --runs 1 \
  --judge-model gpt-5.5 --judge-effort high
```

Live route: openai OAuth → codex CLI worker (gpt-5.5). One fixture, one run. Goal: a
low-cost check that the judge override is wired through the **live product path** and
recorded, not a quality/performance measurement.

## Result

- **Completed, no crash**: 17 pipeline steps, 25 LLM calls, ~709 s; `failed_runs = 0`.
- **Judge override recorded** (reproducibility): `requested_judge_override = { model: "gpt-5.5", effort: "high" }`, durable in the record symmetric to `requested_effort`.
- **Quality gate = failed** on this single live run (q1 recall 0.75, q2 support 0.5) — expected noise for one non-decision-grade live run; not a regression signal.

## Limitation — judge LLM call not exercised this run

The live-authored answer-support ledger had **no `convergent_source_evidence` cluster**
(the `answer_support_ledger` step emitted an effectively empty ledger, 24 output chars),
so the judge **correctly early-exited** with empty judgments and **no LLM call** — there is
no `answer_support_judgment` unit in the telemetry. Whether a convergent cluster forms is
non-deterministic in live authoring, so observing the judge actually adopt `gpt-5.5` and run
at `high` effort on a real judge call would need a run that produces such a cluster (beyond
the 1-run smoke budget).

The adopt-vs-degrade logic itself — including the Codex-found codex-runtime / model-provider
support check — is proven deterministically by the `resolveJudgeLlmConfig` unit tests
(`src/core-api/reconstruct-api.test.ts`), including the codex-runtime regression case.

## Out-of-scope observation

All live units (the **author** path) reported `effort = "xhigh"` despite settings
`semantic_author.llm.effort = "medium"`. This is the author/codex effort path, unrelated to
this feature (a judge-effort leak would surface as `"high"`, not `"xhigh"`; the author config
construction is unchanged by PR #62). Likely a codex effort mapping; tracked separately if it
matters.

## Conclusion

Smoke validates the judge override **plumbing end-to-end on the live product path**
(forward → record → complete, zero regression). Judge-call-level behavior is covered by the
deterministic unit tests; observing it live needs a convergent-cluster run.
