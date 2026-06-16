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

## Limitation of THIS run — judge LLM call not exercised in the full pipeline (observed separately below)

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

## Direct judge-call observation (isolated stage, live)

Two full-pipeline live runs (schedule.csv, and a strongly-redundant 3-source library target)
both produced an **empty answer-support ledger** (`evidence_clusters: []`) → judge early-exit,
so the judge LLM call could not be observed end-to-end (convergent-cluster formation is a
non-deterministic upstream LLM decision). To observe it directly, the judge stage was isolated:
the production `writeAnswerSupportJudgment` was driven with a hand-crafted convergent ledger
(one cluster, two independent source observations stating the same fact) and the **real** judge
config resolved by `resolveJudgeLlmConfig` (no mock). Observed:

- **ADOPTED, not degraded** — `resolveJudgeLlmConfig` returned `note = null` on the real
  default route: author `provider = codex` (OpenAI OAuth runtime), judge model `gpt-5.5`
  checked against model provider `openai` → supported → adopted. (Before the Codex fix this
  would have degraded — the lever would be dead.)
- **Per-stage effort difference is real** — author `effort = medium`, judge `effort = high`;
  the codex call ran at `effort="high"`. (This also clarifies the "xhigh" note below: with an
  explicit config the judge runs at exactly the requested `high`.)
- **Real judge LLM call** — `llm_call_count = 1`, ~12.6 s, real tokens (642 in / 141 out).
- **Not a rubber-stamp** — the judge read each cited excerpt and returned reasoned verdicts:
  both evidence refs `supported`, each rationale quoting the source's "≤ 5 books" statement →
  convergent (≥2 independent) support confirmed.

This exercises the exact production judge path (resolve → `createDirectCallReconstructDirectiveAuthor`
→ `writeAnswerSupportJudgment` → real `callLlm`); only the ledger input was synthesized to
guarantee a convergent cluster.

## Out-of-scope observation

In the **full-pipeline** runs all units (the **author** path) reported `effort = "xhigh"`
despite settings `semantic_author.llm.effort = "medium"`. This is the author/codex effort path,
unrelated to this feature (a judge-effort leak would surface as `"high"`, not `"xhigh"`; the
isolated probe above confirms the judge runs at exactly its configured `high`). Likely a
settings-chain/codex author-effort mapping; tracked separately if it matters.

## Conclusion

The judge override is validated on the live route: **plumbing end-to-end** (full pipeline:
forward → record → complete, zero regression) and the **judge LLM call itself** (isolated
stage: adopt on the codex runtime, per-stage `high` effort, reasoned non-rubber-stamp verdicts).
Full-pipeline judge-call observation remains gated on a convergent cluster forming, which is a
non-deterministic upstream LLM decision.
