# Concept Surface Audit

> 상태: Draft
> 작성일: 2026-05-25
> 목표: `onto-mcp` 전역의 runtime/document/type 개념 surface를 수집하고, 과분화된 개념을 병합·하위 필드화·rename·retire 대상으로 분류한다.

---

## 1. Method

이 감사는 [concept-surface-inventory.json](/Users/kangmin/cowork/onto-mcp/development-records/audit/20260525-concept-surface-inventory.json)을 근거로 한다.

수집 범위:

- `.onto/authority/**`
- `.onto/processes/**`
- `.onto/domains/**`
- `src/**/*.ts`
- `src/mcp/**`
- `src/core-api/**`
- `docs/**`
- `package.json`
- `IMPLEMENTATION_MAP.html`

수집 항목:

- TS exported type/interface/class/function/const
- TS string union values
- Zod enum values
- CLI flags
- YAML keys
- Markdown headings/code identifiers
- 개념 cluster별 용어 출현

제외:

- `development-records/archive/**`
- historical handoff/audit/history 문서
- generated `.onto/review/**` session artifact

---

## 2. Inventory Summary

| Metric | Count |
|---|---:|
| Files scanned | 392 |
| Exported TS definitions | 989 |
| Exported TS union types | 113 |
| Zod enums | 10 |
| Unique CLI flags | 93 |

| Cluster | Occurrences | Files | Highest-density files |
|---|---:|---:|---|
| `target_boundary_profile` | 6186 | 325 | `review-invoke.ts`, `core-lexicon.yaml`, `materializers.ts`, `review-target-profile-contract.md` |
| `alignment_domain` | 5317 | 253 | `materialize-review-prompt-packets.ts`, domain `competency_qs.md`, `review.md` |
| `reasoning_actor` | 5165 | 236 | `run-review-prompt-execution.ts`, `review-invoke.ts`, `nested-spawn-coordinator-contract.md` |
| `issue_deliberation` | 2642 | 113 | `issue-artifact-runtime.ts`, `issue-stance-deliberation-contract.md` |
| `artifact_lifecycle` | 2528 | 216 | `run-review-prompt-execution.ts`, `materialize-review-prompt-packets.ts`, `pre-dispatch-contracts.md` |
| `execution_route` | 2426 | 190 | `review-invoke.ts`, `core-lexicon.yaml`, `llm-caller.ts`, `host-detection.ts` |
| `resolution_qualifiers` | 1213 | 166 | `reconstruct.md`, `materialize-review-prompt-packets.ts`, `review-execution-profile.ts` |

---

## 3. Cluster Findings

### 3.1 Execution Route Cluster

Terms: `provider`, `runtime`, `host`, `executor`, `route`

Current surface:

- `llm.provider` is user configuration authority: `openai | anthropic | grok | lmstudio`.
- `RuntimeLlmProvider` is normalized provider authority: `codex | openai | anthropic | grok | lmstudio`.
- `ReviewHostRuntime` currently mixes host runtimes and direct-call providers: `codex | claude | standalone | openai | anthropic | grok | lmstudio`.
- `ReviewWorkerExecutor` selects execution mechanism: `codex | direct_call | mock`.
- `execution_realization` selects artifact-level execution shape: `worker | host-team | direct-call`.
- `runtime_provider`, `worker_executor`, and `host_runtime` are repeated across execution plan, actor invocation profiles, run manifest, binding, session metadata, MCP visibility, and preview output.

Evidence:

- [model-switcher.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/llm/model-switcher.ts:1)
- [review-execution-profile.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/review/review-execution-profile.ts:15)
- [artifact-types.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/review/artifact-types.ts:3)
- [review-invoke.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/cli/review-invoke.ts:330)
- [execution-preparation-artifacts.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/execution-preparation-artifacts.md:76)
- [core-lexicon.yaml](/Users/kangmin/cowork/onto-mcp/.onto/authority/core-lexicon.yaml:470)

Judgement:

| Concept | Decision | Reason |
|---|---|---|
| `llm.provider` | 유지 | User-owned model provider input. It has distinct validation and auth semantics. |
| `RuntimeLlmProvider` | 하위 필드화 후보 | It is derived from `llm.provider + auth`; independent configuration authority is weak. |
| `ReviewHostRuntime` | rename/narrow 후보 | `openai/anthropic/grok/lmstudio` are not host runtimes in the same sense as `codex/claude/standalone`. |
| `ReviewWorkerExecutor` | 하위 필드화 후보 | It is route mechanism, not a standalone ontology concept. |
| `execution_realization` | 유지 또는 route child 후보 | Artifact-level dispatch shape has user-visible review consequences, but overlaps with worker executor. |
| `runtime_provider` | 하위 필드화 후보 | Audit/visibility value; should be derived, not selected. |

Recommended direction:

- Keep user input as `llm.provider`.
- Centralize route-derived fields through an internal projection helper in TS/runtime code.
- Keep `ReviewExecutionProfile` as the execution selection authority; the projection helper must not become a public config, CLI, MCP, or artifact authority.
- Do not accept old aliases silently; when public artifact or MCP shape changes, retired fields should fail loud at runtime boundaries.
- First cleanup should address this cluster because it already caused the Codex OAuth route mismatch.

### 3.2 Target / Boundary / Profile Cluster

Terms: `target`, `scope`, `boundary`, `input`, `artifact`, `profile`

Current surface:

- `ReviewTargetScopeCandidate`, `ResolvedTargetScope`, `TargetSnapshotManifest`, `ReviewTargetProfileArtifact`, `materialized-input`, and boundary state all describe neighboring parts of "what is being reviewed".
- `ReviewTargetProfile` is the canonical artifact for artifact role, input kind, closure level, review goal, target refs, and inference.
- `BoundaryPolicy` and `EffectiveBoundaryState` own access/enforcement concerns.
- `ReviewProfile` is a design candidate only and should not become runtime authority until its distinct lifecycle is proven.

Evidence:

- [artifact-types.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/review/artifact-types.ts:47)
- [review-target-profile-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/review-target-profile-contract.md)
- [review-context-manifest-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/review-context-manifest-contract.md)
- [20260525-review-profile-generalization-confirmation-ux.md](/Users/kangmin/cowork/onto-mcp/development-records/plans/20260525-review-profile-generalization-confirmation-ux.md)

Judgement:

| Concept | Decision | Reason |
|---|---|---|
| `ResolvedTargetScope` | 유지 | Binding-level truth for filesystem target refs. |
| `ReviewTargetProfile` | 유지 | Review semantics differ from raw refs and boundary. |
| `BoundaryPolicy` / `EffectiveBoundaryState` | 유지 | Access decisions have distinct failure and enforcement semantics. |
| `ReviewProfile` | 보류 | Useful as future composition layer, but no active runtime authority yet. |
| `materialized_input_kind` vs `target_input_kind` | rename/clarify 후보 | Similar names refer to different layers; active docs must preserve phase distinction. |

Recommended direction:

- Keep target binding, target profile, and boundary as separate only where failure semantics differ.
- Avoid adding a new `ReviewProfile` runtime artifact now.
- Add confirmation/override UX later as a controlled extension of `ReviewTargetProfile`, not a parallel authority.

### 3.3 Artifact Lifecycle Cluster

Terms: `binding`, `manifest`, `plan`, `record`, `packet`

Current surface:

- `binding.yaml`, `execution-plan.yaml`, `review-run-manifest.yaml`, prompt packets, execution result, final output, and review record all preserve different phases.
- Route fields are repeated across lifecycle artifacts.
- `ReviewRecord` is the primary final artifact, but some summary fields are also reassembled into MCP response and final output.

Evidence:

- [record-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/record-contract.md)
- [record-field-mapping.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/record-field-mapping.md)
- [pre-dispatch-contracts.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/pre-dispatch-contracts.md)
- [review-api.ts](/Users/kangmin/cowork/onto-mcp/src/core-api/review-api.ts:310)
- [run-review-prompt-execution.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/cli/run-review-prompt-execution.ts:563)

Judgement:

| Concept | Decision | Reason |
|---|---|---|
| `InvocationBinding` | 유지 | Runtime-owned binding truth. |
| `ExecutionPlan` | 유지 | Dispatch plan and packet refs are phase-specific. |
| `ReviewRunManifest` | 유지 | Bounded MCP/runtime visibility manifest. |
| `ReviewRecord` | 유지 | Primary final artifact. |
| Route field duplication | 하위 필드화/centralization 후보 | Same derived route values are copied across artifacts. |

Recommended direction:

- Keep lifecycle artifacts.
- Centralize route projection generation so repeated visibility fields cannot drift.
- Do not accept copied route visibility values as preparation inputs.
- Treat prompt packet refs/hash as boundary truth; do not infer runtime authority from copied summaries.

### 3.4 Resolution Qualifier Cluster

Terms: `selected`, `resolved`, `effective`, `normalized`, `inferred`

Current surface:

- These qualifiers are used as phase markers across interpretation, binding, runtime normalization, and effective boundary enforcement.
- They are sometimes embedded in type names or fields without a uniform phase rule.

Evidence:

- [binding-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/binding-contract.md)
- [model-switcher.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/llm/model-switcher.ts:21)
- [artifact-types.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/review/artifact-types.ts:196)

Judgement:

| Qualifier | Decision | Rule |
|---|---|---|
| `selected` | 유지 as phase qualifier | User or LLM selection before binding. |
| `resolved` | 유지 as runtime binding qualifier | Runtime-fixed value. |
| `effective` | 유지 as enforcement qualifier | Runtime value after environment constraints. |
| `normalized` | 제한 | Internal parse/normalization only; avoid public artifact authority. |
| `inferred` | 제한 | Advisory unless confidence/confirmation is recorded. |

Recommended direction:

- Do not create independent concepts by adding these prefixes.
- Use them only as lifecycle qualifiers with documented phase ownership.

### 3.5 Reasoning Actor Cluster

Terms: `actor`, `worker`, `lens`, `unit`, `agent`, `subprocess`

Current surface:

- `teamlead`, `lens`, and `synthesize` are actor kinds.
- `lens` is also a specific context-isolated reasoning unit.
- `worker` is both an execution seat and an executor mechanism.
- `agent` appears in docs and learning/promote code; `subprocess` is not materially present in active runtime terms.

Evidence:

- [artifact-types.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/review/artifact-types.ts:74)
- [settings-chain.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/discovery/settings-chain.ts:33)
- [lens-registry.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/lens-registry.md)
- [nested-spawn-coordinator-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/nested-spawn-coordinator-contract.md:53)

Judgement:

| Concept | Decision | Reason |
|---|---|---|
| `actor` | 유지 | Covers teamlead/lens/synthesize uniformly. |
| `lens` | 유지 | Domain-specific review perspective unit. |
| `worker` seat | 유지 but clarify | Needed for main/worker isolation. |
| `worker_executor` | route child 후보 | Execution mechanism, not actor identity. |
| `agent` | rename/limit 후보 | Host-specific term; use only where provider API uses it. |
| `subprocess` | retire from canonical naming | Codex/Claude naming differs; "context-isolated reasoning unit" is canonical. |

Recommended direction:

- Keep `actor` as generic runtime term.
- Keep `lens` as review perspective actor.
- Avoid introducing host-specific `agent/subprocess` into canonical contracts.

### 3.6 Issue / Deliberation Cluster

Terms: `finding`, `issue`, `problem`, `cluster`, `stance`, `deliberation`

Current surface:

- Review now distinguishes surface findings, root-cause issue clusters, all-lens stance matrix, deliberation plan, and problem framing.
- This cluster is semantically rich, but the distinctions mostly map to different artifacts and phases.

Evidence:

- [issue-artifact-runtime.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/review/issue-artifact-runtime.ts)
- [issue-stance-deliberation-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/issue-stance-deliberation-contract.md)
- [synthesize-prompt-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/synthesize-prompt-contract.md)

Judgement:

| Concept | Decision | Reason |
|---|---|---|
| `finding` | 유지 | Lens-output surface observation. |
| `issue` | 유지 | Clustered problem unit for stance/deliberation. |
| `problem-framing` | 유지 | Final classification/framing layer. |
| `stance` | 유지 | Required for all-lens position matrix. |
| `deliberation` | 유지 | Conflict resolution phase with artifact authority. |
| `cluster` | rename/clarify 후보 | Prefer "root-cause issue" wording in active docs where possible. |

Recommended direction:

- Keep this cluster mostly intact.
- Ensure "finding" is not treated as the same unit as "issue".
- Prefer "root-cause issue" or "issue grouping" over generic "cluster" when user-facing.

### 3.7 Domain / Alignment Cluster

Terms: `domain`, `axiology`, `alignment`, `value`, `criteria`

Current surface:

- Domain docs provide background/context for lenses and problem framing.
- `axiology` is a special lens, not a separate actor class.
- `review-value-alignment-criteria` is a preparation artifact and must be confirmed when confidence is low.

Evidence:

- [review-context-manifest-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/review-context-manifest-contract.md)
- [execution-preparation-artifacts.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/execution-preparation-artifacts.md)
- [materialize-review-prompt-packets.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/cli/materialize-review-prompt-packets.ts)

Judgement:

| Concept | Decision | Reason |
|---|---|---|
| `domain` | 유지 | Domain docs change review behavior. |
| `axiology` | 유지 as lens | Special lens for value judgement, not separate actor class. |
| `alignment criteria` | 유지 | User-intent-sensitive review boundary. |
| `value` | clarify | Should not become a generic parallel axis when criteria artifact is enough. |

Recommended direction:

- Keep axiology as a lens.
- Keep alignment criteria as explicit review preparation artifact.
- Require preview/confirmation before dispatch when inferred alignment criteria are not high confidence.

---

## 4. Cross-Cutting Risks

1. `provider` is currently overloaded across user input, normalized runtime selection, direct-call provider, host route, and credential route.
2. `host_runtime` currently includes both host environments and direct-call providers.
3. Route truth is repeated across artifacts and MCP visibility; copied values can drift.
4. `ReviewProfile` is useful as a planning concept but would be harmful if introduced as a parallel runtime artifact before lifecycle ownership is closed.
5. Qualifier prefixes can create fake concepts if used without phase ownership.
6. Host-specific vocabulary (`agent`, `subprocess`, `worker`) can leak into canonical docs and confuse cross-provider operation.

---

## 5. Prioritized Cleanup Candidates

| Priority | Candidate | Action |
|---:|---|---|
| 1 | Execution route cluster | Consolidate route-derived fields and narrow naming around user input vs runtime route. |
| 2 | Target/profile confirmation | Keep `ReviewTargetProfile` as authority; design confirmation/override without adding parallel `ReviewProfile` runtime artifact. |
| 3 | Artifact route duplication | Generate route visibility from one internal projection helper. |
| 4 | Qualifier rules | Document phase ownership for selected/resolved/effective/normalized/inferred. |
| 5 | Actor vocabulary | Keep actor/lens/worker-seat terms; retire host-specific generic aliases from active docs. |
| 6 | Issue wording | Keep finding/issue/problem distinctions; rename generic cluster phrasing where user-facing. |
| 7 | Alignment/domain | Keep axiology as lens and alignment criteria as preparation artifact. |

---

## 6. Immediate Next Step

Create a simplification plan that starts with the execution route cluster. This is the highest-risk cluster because it already produced a live bug where normalized `codex` provider was incorrectly compared as if it were configured `openai` provider.
