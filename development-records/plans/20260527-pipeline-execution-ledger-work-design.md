# 2026-05-27 Pipeline Execution Ledger Work Design

Status: implementation design

Goal: implement `PipelineExecutionLedger` as the shared artifact
trust/provenance projection for `review` first, then align `reconstruct` and
future `evolve` to the same shape.

Canonical contracts:

- `.onto/authority/core-lexicon.yaml`
- `.onto/processes/shared/pipeline-execution-ledger-contract.md`
- `docs/architecture/review-continuation-surface.md`

## 1. Done When

The work is complete when:

- `PipelineExecutionLedger` is the only shared ledger concept name.
- `review_status` exposes an artifact-backed ledger projection for prepared,
  running, halted, and completed review sessions.
- The review ledger identifies trusted, untrusted, and upstream-blocked
  artifact boundaries without rescanning ad hoc from file existence alone.
- `ReviewContinuationPlan` derives its frontier from the ledger.
- `onto.review_continue` can continue failed or missing review units without
  overwriting trusted completed units.
- `reconstruct_status` exposes the same ledger shape over `ReconstructStageId`
  stages.
- future `evolve` remains contract-aligned without introducing active runtime.
- tests prove ledger trust boundaries, continuation frontier derivation, MCP
  projection, and final artifact integrity.

## 2. Work Units

| ID | Work unit | Intended result | Done criteria | Verification | Depends on |
|---|---|---|---|---|---|
| W0 | Name and contract lock | Canonical name is `PipelineExecutionLedger`; `unit` appears only as entry granularity. | No retired ledger-name references remain in active docs/code. Core lexicon YAML parses. | `rg "PipelineExecutionUnitLedger|pipeline-execution-unit-ledger" .onto docs src scripts README.md AGENTS.md IMPLEMENTATION_MAP.html` returns no hits; `ruby -e "require 'yaml'; YAML.load_file('.onto/authority/core-lexicon.yaml')"` | none |
| W1 | Shared TS model | Shared runtime type and small helper module exist. | `PipelineExecutionLedger`, `PipelineExecutionLedgerUnitEntry`, status/trust enums, and normalization helpers compile from a shared runtime seat. | `npx vitest run src/core-runtime/pipeline-execution-ledger.test.ts`; `npm run check:ts-core` | W0 |
| W2 | Generic artifact trust helpers | Common helpers can inspect artifact existence, hashes, required outputs, and upstream trust. | Fixtures cover trusted, failed, missing, skipped, and blocked-by-upstream entries. Helpers do not know review/reconstruct semantics. | Unit tests with temp fixtures and hash assertions. | W1 |
| W3 | Review ledger projection | `review` maps execution plan, manifest, execution result, barrier, semantic ledgers, and output seats into `PipelineExecutionLedger`. | Prepared sessions show planned/not-reached units; completed sessions show trusted units; halted lens/deliberation/synthesize fixtures show first untrusted unit and blocked downstream units. | `npx vitest run src/core-runtime/review/pipeline-execution-ledger.test.ts` | W1, W2 |
| W4 | Review status exposure | Core API and MCP status expose the ledger or bounded projection. | `getReviewStatus` returns `pipelineExecutionLedger`; MCP `onto.review_status` structured content includes the same projection after project-boundary checks. | `npx vitest run src/core-api/review-api.test.ts`; `npm run test:mcp:review` targeted assertions | W3 |
| W5 | Continuation plan derivation | `ReviewContinuationPlan` consumes the ledger trust boundary. | Frontier is the first failed/missing/untrusted required unit; trusted completed units are reuse-only; targetUnits rejects trusted completed units. | Review continuation planner tests for halted lens, issue artifact, per-lens deliberation, controlled deliberation, synthesize, and completed-unit rejection. | W4 |
| W6 | Review continue execution | `onto.review_continue` runs only failed or missing frontier units and downstream required units. | Continued run preserves trusted outputs, writes attempt provenance, promotes validated replacement outputs, and updates session-level execution result/final artifacts. | MCP conformance fixtures plus mock review runs for lens halt, deliberation halt, synthesize halt, stale packet block, and completed-unit rejection. | W5 |
| W7 | Reconstruct ledger projection | `reconstruct` maps `ReconstructStageId` stages into the shared ledger shape. | Runtime-owned stages are trusted when outputs validate; LLM-authored artifacts remain untrusted until matching validation stages complete; downstream stages are blocked by untrusted upstream artifacts. | `npx vitest run src/core-runtime/reconstruct/pipeline-execution-ledger.test.ts src/core-api/reconstruct-api.test.ts` | W1, W2 |
| W8 | Reconstruct status/result exposure | Reconstruct status/result can explain artifact trust boundaries. | `onto.reconstruct_status` and `onto.reconstruct_result` expose ledger summary or refs without claiming runtime-authored semantics. | Reconstruct MCP/core API tests for happy path and validation failure fixtures. | W7 |
| W9 | Evolve alignment guard | Future evolve contract remains aligned without active runtime. | Contract states every future evolve stage must produce ledger entries before result exposure. No runtime tool is added. | `rg` scan and documentation review; no code path for active `onto.evolve`. | W0 |
| W10 | Documentation and implementation map closure | Active docs explain ledger authority, consumers, and deferred durable artifact policy. | Implementation map and architecture docs point to shared contract; review continuation is described as a consumer. | Link/path existence checks, `git diff --check`, HTML smoke check. | W4, W7, W9 |

## 3. Dependency Order

Recommended sequence:

1. W0 name and contract lock.
2. W1 shared TS model.
3. W2 generic artifact trust helpers.
4. W3 review ledger projection.
5. W4 review status/MCP exposure.
6. W5 continuation plan derivation.
7. W6 `onto.review_continue` execution.
8. W7 reconstruct ledger projection.
9. W8 reconstruct status/result exposure.
10. W9 evolve alignment guard.
11. W10 documentation closure.

Parallel-safe work:

- W7 can start after W1/W2, while W5/W6 continue on the review path.
- W9 is documentation-only and can run after W0.
- W10 should stay last so it reflects implementation truth.

## 4. Integrity Test Plan

Run these checks before claiming completion:

```bash
! rg "PipelineExecutionUnitLedger|pipeline-execution-unit-ledger" .onto docs src scripts README.md AGENTS.md IMPLEMENTATION_MAP.html
ruby -e "require 'yaml'; YAML.load_file('.onto/authority/core-lexicon.yaml')"
npm run check:ts-core
npm run build:ts-core
npx vitest run \
  src/core-runtime/pipeline-execution-ledger.test.ts \
  src/core-runtime/review/pipeline-execution-ledger.test.ts \
  src/core-runtime/reconstruct/pipeline-execution-ledger.test.ts \
  src/core-api/review-api.test.ts \
  src/core-api/reconstruct-api.test.ts
npm run test:mcp:review
npm run test:review:hardening
npm run test:e2e
git diff --check
```

Semantic integrity assertions:

- A completed review run has no `untrusted` or `blocked_by_upstream` required
  units.
- A halted review run has exactly one earliest failed/missing boundary unless
  the source artifacts prove multiple same-frontier failures.
- Downstream artifacts after a failed unit are `blocked_by_upstream`, even if a
  stale file happens to exist.
- `finding-ledger.yaml` and `issue-ledger.yaml` are semantic inputs, not
  substitutes for execution trust.
- A reconstruct LLM-authored artifact is not trusted until its runtime
  validation stage completes.
- Result/status surfaces never infer semantic correctness from ledger trust;
  ledger trust only says the producing process completed and validated.

## 5. Deferred

- Durable root `pipeline-execution-ledger.yaml` artifact. Start with derived
  status projection unless audit or replay consumers require a file.
- Force-rerun of trusted completed units.
- Cross-session artifact import.
- Active `evolve` runtime or MCP tools.
- Live provider conformance beyond intentional credential/endpoints runs.
