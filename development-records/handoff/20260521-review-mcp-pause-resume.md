# 2026-05-21 Review MCP Pause Resume

상태: paused by user before connectivity interruption.

## Goal

`onto.review` MCP path를 canonical controlled lens deliberation 경로로 정착한다.

타협 불가 기준:

- lens들은 서로 분리된 context에서 병렬 검토한다.
- 충돌 지점은 synthesize 이전에 controlled lens deliberation artifact로 resolve한다.
- synthesize는 deliberation 결과를 소비하며 새 독립 resolution channel을 만들지 않는다.
- runtime 경로는 fail-loud 하며 compatibility shim을 만들지 않는다.
- 과거 경로 설명은 runtime/docs 문맥에서 제거하고 archive 또는 development-records로 격리한다.

## Completed Before Pause

- controlled deliberation runtime added:
  - `src/core-runtime/review/controlled-lens-deliberation.ts`
  - deliberation unit kind / execution result / review record field wiring
  - `deliberation/round1/*-deliberation.md`, prompt packets, `deliberation.md`
  - runner now executes lens -> per-lens deliberation -> teamlead deliberation -> synthesize
  - synthesize requires `deliberation_status: performed`
- MCP schema accepts `controlled_lens_deliberation`.
- `scripts/mcp-review-conformance.ts` added and `npm run test:mcp:review` added.
- Archive material created:
  - `development-records/archive/20260521-review-runtime-legacy-mode-policy/`
  - `development-records/archive/20260521-review-archival-material/philosopher.md`
- `development-records/legacy/` directory removed after moving contents.
- `process.md`, `.onto/processes/review/*`, topology mapping tests, codex nested tests, and host detection were partially cleaned toward current review path language.

## Last Verification Before Pause

Command run:

```bash
npx vitest run src/core-runtime/cli/topology-executor-mapping.test.ts src/core-runtime/review/shape-to-topology-id.test.ts src/core-runtime/cli/review-invoke-topology-dispatch.test.ts src/core-runtime/review/materializers-effort-persist.test.ts src/core-runtime/cli/teamcreate-lens-deliberation-executor.test.ts src/core-runtime/cli/codex-nested-dispatch.test.ts src/core-runtime/cli/codex-nested-teamlead-executor.test.ts src/core-runtime/discovery/host-detection.test.ts src/core-runtime/review/shape-pipeline-audit.test.ts src/core-runtime/review/execution-topology-resolver.test.ts
```

Result: 8 files passed, 2 files failed, 188 passed, 4 failed.

Failing tests:

- `src/core-runtime/review/materializers-effort-persist.test.ts`
  - test still writes old model config shapes:
    - `model: gpt-5.4` + `codex.effort`
    - `external_http_provider: anthropic` + `anthropic.model`
  - update to canonical `llm:` switcher:
    - OpenAI OAuth case should expect provider `codex`, model `gpt-5.4`, effort `high`
    - Anthropic API key case should expect provider `anthropic`, model `claude-sonnet-4-6`
- `src/core-runtime/cli/review-invoke-topology-dispatch.test.ts`
  - environment had real Codex availability, so "no host" assumption is invalid.
  - use cached topology inputs for deterministic null/success tests.
  - for `codex-nested-subprocess`, current `tryTopologyDerivedExecutor` reaches `mapTopologyToExecutorConfig` and throws. Preferred fix: in `tryTopologyDerivedExecutor`, return null when topology id is not in `EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES` before mapping, or add a `canMapTopologyToExecutor` helper.

## Recommended Immediate Resume Steps

1. Patch `materializers-effort-persist.test.ts` to use canonical `llm:` config only.
2. Patch `tryTopologyDerivedExecutor` to return null for unsupported mapping ids before calling `mapTopologyToExecutorConfig`.
3. Patch `review-invoke-topology-dispatch.test.ts` so no test depends on ambient Codex availability.
4. Re-run the targeted vitest command above.
5. Then run:

```bash
npm run check:ts-core
npm run build:ts-core
npm run lint:output-language-boundary
npm run test:mcp:review
```

6. Final scan for review/MCP runtime path language:

```bash
rg -n "fallback|Fallback|legacy|history|PR-A|PR-B|PR-C|PR-D|PR-H|execution_topology_priority|cc-teams-litellm|litellm-http|liteLlmEndpointAvailable|synthesizer-only|batch_fallback|synthesize는 deliberation actor|in-process deliberation" process.md .onto/processes/review src/core-runtime/cli src/core-runtime/review src/core-runtime/discovery src/mcp src/providers scripts/mcp-review-conformance.ts --glob '!**/*.test.ts' --glob '!scripts/smoke-topology/**'
```

Current known remaining matches in that scan are mostly migration/session-root utilities and install detection outside the review MCP path. Treat separately unless they are pulled into runtime prompt artifacts.

## Do Not Do Yet

- Do not commit.
- Do not push.
- Do not create GitHub repository until the user explicitly resumes and confirms the work is complete enough for commit/push.
