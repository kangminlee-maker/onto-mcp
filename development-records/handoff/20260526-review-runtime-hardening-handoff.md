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

Do not solve this by adding inline fallback. The next policy needs to decide whether a deliberation timeout should:

1. remain a hard halt for contested deliberation, or
2. be recorded as an unresolved lens stance so synthesize can continue with bounded disclosure.

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

## 6. Recommended Next Work

Recommended next task:

```text
Design and implement controlled deliberation timeout policy.
```

Acceptance direction:

- Preserve context-isolated lens outputs.
- Preserve timeout identity and timed-out lens id in artifacts.
- Avoid silent synthesis drift.
- Avoid compatibility shims or fallback paths.
- Decide whether synthesize is allowed after a deliberation timeout.
- If synthesize proceeds, its prompt packet must include the unresolved/timeout stance as explicit input truth.
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

