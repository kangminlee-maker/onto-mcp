# 2026-05-26 Review Runtime Hardening Handoff

> Status: Active handoff
> Branch: `codex/simplify-review-runtime`
> Base commit before this work: `31c25f7 Simplify review MCP runtime`
> Purpose: allow another LLM to continue the `onto-mcp` review runtime hardening work without needing the full conversation history.

## 1. Product Memory

`onto-mcp` is being shaped into an MCP-native review runtime. The current productized path is `review`; `learn`, `govern`, `reconstruct`, and `evolve` are intentionally outside the current runtime scope until review stabilizes.

The core invariant is:

```text
selected lenses run in isolated contexts
  -> all selected lenses must pass the completion barrier
  -> contested issue stances enter controlled lens deliberation
  -> synthesize conservatively combines lens outputs and deliberation artifacts
  -> ReviewRecord is the primary artifact truth
```

Important user decisions that still apply:

- Prefer fail-loud behavior over compatibility shims.
- Do not keep fallback, history-log, or stale legacy runtime paths in the canonical runtime.
- Do not introduce near-duplicate concepts when an existing concept can be reused or extended.
- Runtime truth belongs in artifacts; user-facing or MCP-facing summaries are bounded projections.
- Actual review testing should use the repo runtime path, especially `npm run review:invoke`, not stale host-specific skill wrappers.
- Implementation review domain should usually be `software-engineering` unless the user asks otherwise.

Current review execution shape:

- `main-workers` + Codex worker is the live route currently exercised.
- Mock/direct-call routes are used for deterministic tests.
- API/local provider quality parity is later work; missing credentials/endpoints must fail before dispatch.
- `axiology` is a special value lens, not a separate actor class.
- `synthesize` must be able to use high effort independently of teamlead/lens settings.

## 2. Current Work Completed

The user asked to run an actual review while testing the implementation. The first live review found a real blocker:

```text
session: .onto/review/20260526-f1b74bc3
result: completed
lenses: 6/6 completed
deliberation: performed
synthesize: completed
main blocker: Tools: required prompt packets could fall back to inline mode after native tool-loop failure or empty output.
```

The blocker was fixed by keeping packet-forced native mode as a hard boundary:

- If a packet declares `Tools: required`, `--tool-mode auto` promotes to native.
- If native tool execution throws, the unit fails.
- If native tool execution returns empty final text, the unit fails.
- The unit must not write an inline fallback output in either failure case.

Files changed for the fix:

- `src/core-runtime/cli/inline-http-review-unit-executor.ts`
- `src/core-runtime/cli/inline-http-review-unit-executor.test.ts`
- `src/core-runtime/llm/llm-tool-loop.ts`

Additional hardening work:

- Added `scripts/review-runtime-hardening.ts`.
- Added `npm run test:review:hardening`.
- Added large directory mock review coverage.
- Added repeated mock review lifecycle coverage.
- Added primary artifact consistency checks across `review-record.yaml`, `issue-ledger.yaml`, `issue-stance-matrix.yaml`, `problem-framing.yaml`, `deliberation.md`, and `final-output.md`.
- Added `Tools: required` native-boundary success/failure identity checks.
- Added declared artifact readability check for packet-declared refs.
- Added fail-loud provider preflight checks for OpenAI, Anthropic, Grok, and LM Studio route shapes.
- Added temp fixture cleanup by default; set `ONTO_REVIEW_HARDENING_KEEP_TMP=1` to preserve fixtures.
- Updated `README.md`.
- Updated `IMPLEMENTATION_MAP.html`.
- Increased one flaky timeout test fixture from `50ms` to `500ms` in `src/core-runtime/cli/e2e-codex-multi-agent-fixes.test.ts`.

## 3. Validation Already Run

These commands passed after the hardening changes:

```bash
npx vitest run src/core-runtime/cli/inline-http-review-unit-executor.test.ts
npm run check:ts-core
npm run build:ts-core
npm run test:e2e:codex-multi-agent-fixes
npm run test:mcp:review
npm run test:review:hardening
git diff --check
```

Observed details:

- `inline-http-review-unit-executor.test.ts`: 20/20 passed.
- `test:e2e:codex-multi-agent-fixes`: 21/21 passed.
- `test:mcp:review`: passed, representative proof session `.onto/review/20260526-8edd47b6`.
- `test:review:hardening`: passed with:
  - large-directory mock review
  - repeated mock reviews
  - tool-required boundary
  - provider route preflight
  - temp roots cleaned after run

## 4. Actual Re-Review Result

After the fix, a second live Codex review was run against the updated change bundle:

```text
session: .onto/review/20260526-1e6159f0
status: halted_partial
lenses: 6/6 completed
issue artifacts: finding-ledger, finding-relation-graph, issue-ledger, issue-stance-matrix, deliberation-plan completed
synthesize: not executed
halt reason: deliberation-logic timed out after 600000ms during controlled lens deliberation
```

This re-review did not reproduce the original `Tools: required` blocker. Its partial `issue-ledger.yaml` contained only medium/low issues, but because controlled deliberation halted before synthesize, it must be treated as partial evidence, not final approval.

The important new product/runtime finding is:

```text
Live controlled deliberation has a tail-latency halt risk.
The halt is explicit and artifact-backed, but the review produces no synthesize result.
```

Do not solve this by adding inline fallback. Policy decision after this handoff:

- A deliberation timeout remains a hard halt for contested deliberation.
- It is not recorded as an unresolved stance continuation path.
- Synthesize must not run after incomplete controlled deliberation.
- Runtime artifacts must preserve `halt_phase`, failed deliberation unit id/kind, lens-bound `halt_lens_id`, and per-unit `failure_message`.
- ReviewRecord must leave `synthesis_result_ref` and `deliberation_result_ref`
  as `null` when those files were not produced by the halted run.
- ReviewRecord must preserve refs for issue-stage artifacts that were produced
  before the halt.
- Degraded or halted runs must write `degradation-summary.yaml` as the
  structured source for halt/degradation truth; `error-log.md` remains an
  execution log.
- `observed_dispatch_width` is the planned/observed lens dispatch breadth;
  scheduler concurrency remains `max_concurrent_lenses`.

## 5. Current Changed Files

Expected modified/new files at handoff time:

```text
IMPLEMENTATION_MAP.html
README.md
package.json
scripts/review-runtime-hardening.ts
src/core-runtime/cli/e2e-codex-multi-agent-fixes.test.ts
src/core-runtime/cli/inline-http-review-unit-executor.test.ts
src/core-runtime/cli/inline-http-review-unit-executor.ts
src/core-runtime/llm/llm-tool-loop.ts
development-records/handoff/20260526-review-runtime-hardening-handoff.md
```

Additional files touched by the controlled deliberation hard-halt policy
continuation:

```text
.onto/processes/review/issue-stance-deliberation-contract.md
.onto/processes/review/pre-dispatch-contracts.md
.onto/processes/review/record-contract.md
.onto/processes/review/record-field-mapping.md
src/core-runtime/review/artifact-types.ts
src/core-runtime/cli/run-review-prompt-execution.ts
src/core-runtime/cli/review-invoke.ts
src/core-runtime/cli/render-review-final-output.ts
src/core-runtime/cli/assemble-review-record.ts
```

## 6. Recommended Next Work

Recommended next task:

```text
Implement and verify controlled deliberation hard-halt artifact precision.
```

Acceptance direction:

- Preserve context-isolated lens outputs.
- Preserve timeout identity and timed-out lens id in artifacts.
- Avoid silent synthesis drift.
- Avoid compatibility shims or fallback paths.
- Keep synthesize blocked after a deliberation timeout.
- Record `deliberation_status: not_performed` for halted controlled deliberation.
- MCP/CLI result must show the timeout state clearly.
- Add deterministic tests before relying on live review evidence.

Likely files to inspect first:

```text
src/core-runtime/review/run-review-session.ts
src/core-runtime/review/review-execution-types.ts
src/core-runtime/review/review-record.ts
src/core-runtime/cli/e2e-codex-multi-agent-fixes.test.ts
.onto/processes/review/issue-stance-deliberation-contract.md
.onto/processes/review/record-contract.md
.onto/processes/review/record-field-mapping.md
```

Suggested verification after that task:

```bash
npm run check:ts-core
npm run test:e2e:codex-multi-agent-fixes
npm run test:mcp:review
npm run test:review:hardening
git diff --check
```

Then run one actual review again with `domain=software-engineering`.

## 7. Operational Notes

Use the canonical review invocation shape for implementation bundles:

```bash
npm run review:invoke -- <primary-target> "<intent>" \
  --target-scope-kind bundle \
  --primary-ref <primary-target> \
  --member-ref <other-file> \
  --bundle-kind implementation_change_bundle \
  --domain software-engineering \
  --review-mode core-axis \
  --no-watch
```

For deterministic local hardening:

```bash
npm run test:review:hardening
```

For preserving hardening temp fixtures:

```bash
ONTO_REVIEW_HARDENING_KEEP_TMP=1 npm run test:review:hardening
```

Avoid treating `.onto/review/20260526-1e6159f0` as a successful final review. It is useful evidence for latency/failure behavior only.

## 8. Continuation Update

The follow-up implementation added:

- shared `ReviewRecord` validation in `src/core-runtime/review/review-record-validation.ts`, used by record assembly and core API/MCP result reads
- `degradation-summary.yaml` as the structured degraded/halted source derived from `execution-result.yaml`
- deterministic fixtures proving `domain_threshold_used` for ontology, software-engineering, and spreadsheet/accounting-style thresholds remains a severity explanation, not a second materiality axis
- native MCP `notifications/progress` for `onto.review` calls that supply
  `_meta.progressToken`, with versioned `ontoReviewProgress` metadata
- shared runtime progress step contract used by issue artifacts, execution
  manifests, Core API progress projection, and MCP progress conformance

Representative checks run during this continuation:

```bash
npm run check:ts-core
npm run build:ts-core
npx vitest run src/core-api/review-api.test.ts
npx vitest run src/core-runtime/review/review-result-classification.test.ts src/core-runtime/review/review-record-validation.test.ts
npm run test:e2e
npm run test:e2e:codex-multi-agent-fixes
npm run test:mcp:review
npm run test:review:hardening
git diff --check
```

Latest MCP representative session after the final cleanup pass:

```text
.onto/review/20260526-db400dda
```
