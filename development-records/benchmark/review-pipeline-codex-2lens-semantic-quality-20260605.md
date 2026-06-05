---
as_of: 2026-06-05
status: completed
purpose: semantic quality comparison for real Codex 2-lens review pipeline benchmark
executor: codex
runs_per_case: 1
source_report: development-records/benchmark/review-pipeline-codex-2lens-semantic-20260605.json
---

# Review Pipeline Semantic Quality Compare (2026-06-05)

## Scope

This audit compares semantic quality for the keep-tmp real Codex 2-lens run:

- `existing-low-effort`: actor effort `low`
- `controlled-high-effort`: actor effort `xhigh`
- lenses: `logic`, `structure`
- target: `src/target.ts`

This is a current-checkout effort comparison, not a legacy checkout comparison.

## Target Truth

The target fixture contains one clear material issue:

- `unstableFormat(value: unknown): string` returns raw
  `JSON.stringify(value)`.
- Top-level `JSON.stringify(undefined)`, function, or symbol can return
  `undefined`.
- Therefore the declared return contract can diverge from runtime behavior.

The target also contains bounded uncertainty:

- `ReviewPipelineInput.lensId` is not used by `summarizeReviewPipeline`.
- `unstableFormat` is exported but not used inside the single file.
- Without callers, tests, or API contract, these are evidence gaps rather than
  confirmed structural defects.

## Runtime Summary

| Case | Completed | Command ms | Total unit ms | Total output bytes | Final output bytes | Failed units |
|---|---:|---:|---:|---:|---:|---:|
| existing-low-effort | 1/1 | 590200 | 655842 | 38991 | 11583 | 0 |
| controlled-high-effort | 1/1 | 438657 | 494711 | 25162 | 8647 | 0 |

`controlled-high-effort` was faster in this run and produced less output:

- command duration: -25.68%
- total unit duration: -24.57%
- total output bytes: -35.47%
- final output bytes: -25.35%

## Semantic Quality Rubric

Scores use a 0-5 scale. This is a human/LLM audit of preserved artifacts, not a
deterministic oracle.

| Criterion | Weight | existing-low-effort | controlled-high-effort | Notes |
|---|---:|---:|---:|---|
| Correctness | 30% | 4.5 | 4.5 | Both preserve the real `unstableFormat` return-contract issue as medium severity. |
| Grounding | 20% | 4.5 | 4.0 | Existing cites more concrete refs and preserves structure lens evidence. Candidate is grounded but more compact. |
| Materiality | 15% | 4.0 | 4.5 | Candidate avoids promoting evidence gaps into the issue summary. Existing keeps an info issue, which is correct but noisier. |
| Actionability | 15% | 4.0 | 4.5 | Candidate gives clearer remediation and a focused test suggestion. |
| Boundary uncertainty | 10% | 4.5 | 3.5 | Existing better preserves `lensId`/orphan-export uncertainty. Candidate omits the evidence gap from final output. |
| Coherence and concision | 10% | 4.0 | 4.5 | Candidate is shorter and easier to act on; existing is more comprehensive but heavier. |
| Weighted score | 100% | 4.3 | 4.3 | Near tie with different tradeoffs. |

## Artifact-Level Findings

### existing-low-effort

Strengths:

- Correctly identifies the material return-contract issue.
- Correctly keeps `lensId` and exported `unstableFormat` usage uncertainty as a
  non-material evidence gap rather than a confirmed structural defect.
- Preserves boundary limitations explicitly in final output, issue ledger,
  problem framing, and deliberation.

Weaknesses:

- Adds an `issue-002` root-cause issue for the evidence gap. It is marked
  non-material/info, but it still increases root-cause issue count and final
  output weight.
- Final output is more verbose and can make the user process both a material
  issue and a governance/evidence-gap issue.

### controlled-high-effort

Strengths:

- Correctly identifies and carries forward the material return-contract issue.
- Avoids turning `lensId` unused status or orphan export uncertainty into a
  defect.
- Provides a clearer action path: add fallback or widen return type, plus a
  focused `unstableFormat(undefined)` style test.
- Output is materially smaller while retaining the main corrective conclusion.

Weaknesses:

- Does not preserve the `lensId`/orphan-export evidence gap in final output.
- Boundary uncertainty is acknowledged mainly around synthesize read authority,
  not around all structural observations.

## Conclusion

No semantic quality regression is evident for the core material issue. Both
cases find the same true correctness issue and keep severity at medium.

The quality tradeoff is different:

- `existing-low-effort` is better at preserving boundary uncertainty.
- `controlled-high-effort` is better at material focus, actionability, concision,
  and runtime/output cost.

For the product goal, `controlled-high-effort` is acceptable only if the final
synthesis contract requires a compact `Boundary Notes` section for non-material
evidence gaps. That would preserve the semantic value of the baseline without
reintroducing a large output surface.

## Recommended Next Gate

Add a semantic quality benchmark gate with these pass conditions:

1. Material issue recall: known material issue must appear in final output and
   review record.
2. False materiality guard: evidence gaps must not be classified as material
   issues.
3. Boundary uncertainty preservation: important evidence gaps must appear in a
   compact boundary note or equivalent non-material channel.
4. Actionability: final output must include a concrete remediation path and a
   focused verification suggestion.
5. Grounding: each material issue must cite at least one lens or artifact ref
   and one target anchor when available through the authorized artifact path.
