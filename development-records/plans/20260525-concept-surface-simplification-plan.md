# Concept Surface Simplification Plan

> 상태: Draft
> 작성일: 2026-05-25
> 근거: [Concept Surface Audit](/Users/kangmin/cowork/onto-mcp/development-records/audit/20260525-concept-surface-audit.md)

---

## 1. Purpose

`onto-mcp`의 active review runtime에서 불필요하게 병렬화된 개념 surface를 줄인다. 이 계획은 새 ontology 개념을 늘리는 작업이 아니라, 기존 개념의 독립 자격을 검증하고 runtime이 필요한 최소 구조로 재배치하는 작업이다.

---

## 2. Non-Negotiable Guidelines

- User-owned input and runtime-derived output must not share the same field meaning.
- Derived route values must not become independent configuration authority.
- A projection/helper may exist only as an internal derivation point. It must not become a canonical ontology entity, user setting, public MCP input, or independent artifact authority unless it passes the concept promotion gate below.
- Retired aliases must fail loud at runtime boundaries.
- Active docs describe current behavior only.
- Historical rationale stays in `development-records/` or archive paths.
- One cleanup cluster is changed at a time.
- No compatibility shim is introduced.
- Timeout, retry, and halt behavior stays inside the existing dispatch/execution-result/failure-record model. It must not introduce a new public runtime authority unless the concept promotion gate proves one is necessary.

### 2.1 Concept Promotion Gate

Before a review finding is fixed by adding a new type, field, artifact, CLI flag, MCP field, helper module, or named process, the change must pass this gate:

| Gate | Required evidence |
|---|---|
| Reuse scan | The nearest existing concept has been identified and cannot own the behavior without hiding a real lifecycle or failure difference. |
| Authority seat | The new name has exactly one owner: user input, LLM interpretation, runtime binding, runtime projection, artifact record, or human output. |
| Lifecycle phase | The value is created, frozen, consumed, and invalidated in a phase that differs from its nearest parent. |
| Failure semantics | Removing the split would make a distinct failure impossible to detect or report fail-loud. |
| Artifact truth | The value has a single truth location, or is explicitly marked as copied visibility derived from that truth. |
| Public surface | Public MCP/CLI/config exposure is required for user behavior, not just for implementation convenience. |

If any gate is missing, the fix must reuse the existing concept, make the value a child field, keep the helper private, or record the item as a follow-up instead of adding a new active concept.

### 2.2 Review-Fix Recheck Rule

Every issue found by review must be rechecked before implementation:

1. Does the proposed fix reduce, preserve, or increase the active concept surface?
2. If it increases the surface, which gate above proves the new concept is necessary?
3. Does it introduce a new accepted input for a value that should be derived?
4. Does it move historical rationale into active runtime docs?
5. Does it create a compatibility path instead of a fail-loud boundary?
6. Does the fix reuse an existing enum/value contract instead of creating a near-duplicate token?
7. Does the fix report failure through the existing structured failure surface instead of creating a side-channel log?

The default acceptable fix is one that reduces duplicated derivation or clarifies ownership without adding public authority.

---

## 3. Target Concept Spine

The review runtime should preserve this spine:

```text
InvocationInterpretation
  -> InvocationBinding
  -> ReviewTargetProfile
  -> ReviewExecutionProfile
  -> internal route projection
  -> ActorInvocationProfile
  -> ContextManifest / PromptPacketRefs
  -> LensOutputs
  -> IssueArtifacts
  -> Deliberation
  -> ReviewRecord
```

The route projection is an internal derivation helper, not a new canonical spine concept. It exists only to keep copied route summaries consistent while `ReviewExecutionProfile` remains the active runtime authority for execution selection.

---

## 4. Cluster Decisions

| Cluster | Decision | Implementation posture |
|---|---|---|
| provider/runtime/host/executor/route | Centralize through an internal route projection helper | Implement first |
| target/scope/boundary/input/artifact/profile | Keep three authorities: target binding, target profile, boundary | Design only now; do not add `ReviewProfile` runtime artifact |
| binding/manifest/plan/record/packet | Keep lifecycle artifacts; centralize route projection | Implement after route cleanup |
| selected/resolved/effective/normalized/inferred | Treat as phase qualifiers, not concepts | Document and enforce in naming during edits |
| actor/worker/lens/unit/agent | Keep actor/lens/worker-seat; route executor moves under route | Implement alongside route cleanup where touched |
| finding/issue/problem/cluster/stance | Keep artifact phases; reduce generic cluster wording | Later docs cleanup |
| domain/axiology/alignment/value/criteria | Keep domain docs, axiology lens, alignment criteria artifact | Later confirmation UX work |

---

## 5. Execution Route Cleanup

Status: in progress. The first implementation slice added
`src/core-runtime/review/review-execution-route.ts` and targeted route tests so
route-derived values are produced through one internal projection helper before
being copied into existing artifact visibility shapes.

### 5.1 Current Problem

The route cluster currently has overlapping concepts:

```text
llm.provider        user config provider
RuntimeLlmProvider normalized provider
ReviewHostRuntime  host plus direct-call provider values
ReviewWorkerExecutor execution mechanism
execution_realization artifact dispatch shape
runtime_provider   copied derived value
```

This caused a real failure: `llm.provider=openai + llm.auth=oauth` normalized to `provider=codex`, but Codex route preflight compared the normalized value as if it were still configured `openai`.

### 5.2 Canonical Shape

Use one internal projection for runtime-derived route visibility:

```ts
interface ReviewExecutionRouteProjection {
  host: "codex" | "claude" | "standalone";
  executor: "codex" | "direct_call" | "mock";
  resolved_provider: "codex" | "openai" | "anthropic" | "grok" | "lmstudio" | "mock";
  auth_mode: "api_key" | "oauth" | "local" | null;
  execution_realization: "worker" | "host-team" | "direct-call";
}
```

Rules:

- `llm.provider` remains the user-configured model provider: `openai | anthropic | grok | lmstudio`.
- `resolved_provider` is derived from config/auth/route and is never accepted as user config.
- `host` is the host environment, not the model provider.
- `executor` is the execution mechanism.
- `resolved_provider` never uses host-only values such as `claude`; host-bound identity belongs in `host`.
- `execution_realization` remains public artifact shape while we verify whether it can later collapse into route.
- The projection helper must not add `runtime-provider` or `auth-mode` as accepted preparation inputs; actor profiles derive provider/auth from actor LLM selection and executor mode.

### 5.3 Implementation Steps

1. Add one internal route projection helper that derives route visibility from `ReviewExecutionProfile`.
2. Keep projection types private to the module unless a public consumer needs a compile-time contract.
3. Replace duplicated `runtimeProviderForProfile()` and `authModeForProfile()` helpers with the route builder.
4. Add `runtime_route` to manifest/visibility structures where bounded route summary is needed.
5. Keep existing public artifact fields only where currently required, but generate them from the projection helper.
6. Narrow internal naming so `provider` means user-configured model provider and `resolved_provider` means derived route provider.
7. Add targeted tests for:
   - `openai + oauth -> resolved_provider=codex`
   - `openai + api_key -> resolved_provider=openai`
   - `anthropic + api_key -> resolved_provider=anthropic`
   - `lmstudio + local -> resolved_provider=lmstudio`
   - mock route -> `resolved_provider=mock`
8. Update active docs and `IMPLEMENTATION_MAP.html`.
9. Remove `runtime-provider` and `auth-mode` as preparation CLI inputs because they are derived visibility values.

### 5.4 Non-Goals

- Do not remove lifecycle artifacts in this step.
- Do not introduce a user-facing `runtime_provider` setting.
- Do not accept `provider=codex` in `.onto/settings.json`.
- Do not change provider adapters outside the review route path unless required by type safety.

### 5.5 Done When

- Route-derived fields come from one route builder.
- `llm.provider` and `resolved_provider` are not confused in pre-dispatch checks.
- Preparation materializers do not accept `runtime-provider` or `auth-mode` as inputs.
- Actor-level direct-call provider/auth values are derived from the actor LLM selection, not from a route-level copied value.
- Existing tests pass.
- At least one targeted route test proves Codex OAuth behavior.

Current implementation evidence:

- [review-execution-route.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/review/review-execution-route.ts)
- [review-execution-route.test.ts](/Users/kangmin/cowork/onto-mcp/src/core-runtime/review/review-execution-route.test.ts)

---

## 6. Target/Profile Confirmation Follow-Up

This plan does not implement generalized `ReviewProfile` as a new runtime artifact.

Next design work:

- Keep `ReviewTargetProfile` as the session artifact.
- Add confidence/confirmation fields to the profile process only when low-confidence inference or high-impact closure requires user confirmation.
- Explicit override should validate tokens and record confirmation provenance.
- Generated packet and directory targets need stronger conformance evidence before full productization.

Reference:

- [review profile confirmation UX plan](/Users/kangmin/cowork/onto-mcp/development-records/plans/20260525-review-profile-generalization-confirmation-ux.md)

---

## 7. Verification Plan

After each implementation slice:

```bash
npm run check:ts-core
npm run test:mcp:review
npm run test:e2e
git diff --check
```

After route cleanup:

```bash
npx vitest run src/core-runtime/review/review-execution-route.test.ts
```

Final review verification:

```bash
npm run review:invoke -- . "Review the concept surface simplification implementation for correctness, concept economy, runtime robustness, MCP usability, and artifact truth consistency." --domain software-engineering --review-mode full --no-watch --confirm-value-alignment
```

---

## 8. Completion Criteria

- Audit and inventory artifacts exist.
- This simplification plan exists.
- Execution route cleanup is implemented and tested.
- Active runtime path has no new fallback/shim/deprecated alias.
- `IMPLEMENTATION_MAP.html` reflects current status and remaining risks.
- Full verification commands pass or failures are recorded with exact cause.
- A real review run succeeds and produces artifacts.

---

## 9. Full Review Verification

Live review session:

- `.onto/review/20260525-aaf00c2c`
- domain: `software-engineering`
- status: `completed`
- deliberation: `performed`
- participating lenses: `9/9`

Review disposition:

| Issue | Review classification | Disposition |
|---|---|---|
| `issue-001` | high, current blocker, fix now | Addressed in this slice: the route projection no longer admits `claude` as `resolved_provider`; Claude host identity remains in `host`. Targeted test added. |
| `issue-002` | medium, next-step blocker | Addressed in this slice: actor invocation profiles derive provider/auth from each actor LLM selection; direct-call host/provider/auth conflicts fail loud; absent direct-call actor selection stays unresolved for preflight. Targeted materializer and route tests added. |
| `issue-003` | medium, next-step blocker | Addressed in this slice: `review:invoke`, `prepare-review-session`, and `bootstrap-review-binding` no longer pass or parse `runtime-provider`, `auth-mode`, or `effective-worker-executor`; executor visibility is derived during materialization. Remaining work is broader naming cleanup around `host_runtime`. |
| `issue-004` | medium, planned follow-up | Needs design decision before changing public names for `direct-call`, `ts_inline_http`, `worker_executor`, and provider unions. |
| `issue-005` | medium, evidence gap | Addressed for the current route slice: MCP conformance now asserts `routeVisibility` matches `review-run-manifest.runtime_route`; broader live-provider conformance remains a later provider-parity task. |

Current verification evidence:

- `npm run check:ts-core`: passed
- `npx vitest run src/core-runtime/cli/e2e-codex-multi-agent-fixes.test.ts src/core-runtime/review/review-execution-route.test.ts src/core-runtime/review/materializers-effort-persist.test.ts src/core-runtime/review/route-visibility.test.ts`: passed, 50/50
- `npm run test:mcp:review`: passed, session `.onto/review/20260526-c46edbf1`
- `npm run test:e2e`: passed, 63/63
- `git diff --check`: passed

Latest concept-economy recheck review:

- `.onto/review/20260526-1924f70e`
- domain: `software-engineering`
- status: partial runtime evidence, manually terminated after one coverage deliberation worker stalled for over 21 minutes and retried into the same stall.
- completed: start preview, preparation artifacts, 9/9 lens outputs, lens completion barrier, finding ledger, relation graph, issue ledger, issue stance matrix, deliberation plan, 8/9 lens deliberation responses.
- not completed: teamlead deliberation result, synthesize, review record, final output.
- findings acted on immediately:
  - direct-call actor/provider/auth conflict and absent-selection drift
  - `effective-worker-executor` as preparation input
- follow-up raised by runtime behavior:
  - per-unit timeout and structured terminal timeout failure for stalled review workers.
- implementation response:
  - prompt execution now applies a bounded per-unit timeout to lens, issue-artifact, deliberation, and synthesize units.
  - timeout is an execution policy over existing unit dispatches, not a new ontology concept or public input.
  - stalled deliberation halts before synthesize and writes `execution-result.yaml` / `review-run-manifest.yaml` with `halted_partial`, `synthesis_executed: false`, and a structured halt reason.

Latest completed full recheck:

- `.onto/review/20260526-cfc20c43`
- domain: `software-engineering`
- status: `completed`
- deliberation: `performed`
- participating lenses: `9/9`
- review result: directionally aligned but not promotion-gate complete.
- acted-on findings:
  - issue-artifact failure paths now halt through `execution-result.yaml` / `review-run-manifest.yaml` and keep malformed-output structured failure behavior fail-loud.
  - prepared-session top-level route visibility now reports provider/auth/executor only when actor profiles agree; actor-specific values stay in `actorProfiles`.
  - `direct_call_actor_provider_unresolved` now uses the existing `safe_after_input_change` retry safety token.
  - retry timing comments now match the bounded linear runtime delay.

Final closure recheck:

- `.onto/review/20260526-54627475`
- domain: `software-engineering`
- status: `completed`
- deliberation: `performed`
- participating lenses: `9/9`
- result: concept-promotion gate mostly satisfied; remaining findings were wording/documentation precision, not new runtime authority.
- acted-on immediately:
  - stale retry comment saying retries double was replaced with bounded-linear wording.
  - timeout wording in `IMPLEMENTATION_MAP.html` and MCP architecture docs was narrowed to `execution-result.yaml` / `review-run-manifest.yaml`; structured failure records remain for malformed output and artifact-write failures.

---

## 10. Concept-Economy Recheck Of Review Fixes

The review findings were rechecked against the concept promotion gate before the latest implementation slice:

| Fix area | Concept-economy decision | Evidence |
|---|---|---|
| Route derivation helper | Kept as private internal projection. It does not enter config, MCP input, CLI input, or artifact authority. | `ReviewExecutionRouteProjection` is module-private; public callers only call `buildReviewExecutionRoute()` to derive visibility. |
| `claude` provider collapse | Fixed by keeping host identity in `host` and model-route identity in `resolved_provider`. | `review-execution-route.test.ts` covers Claude host with `resolved_provider=codex`. |
| Actor direct-call provider/auth divergence | Fixed by removing copied route provider/auth as preparation inputs and deriving actor profile values from each actor LLM selection. | `prepare-review-session.ts` and `bootstrap-review-binding.ts` no longer accept `runtime-provider` or `auth-mode`; `materializers-effort-persist.test.ts` covers actor-specific OpenAI/Anthropic direct-call values. |
| Executor visibility | Fixed by deriving `effective_worker_executor` inside materialization from execution context instead of accepting it as a preparation input. | `review:invoke`, `prepare-review-session`, and `bootstrap-review-binding` no longer pass or parse `effective-worker-executor`; materializer tests cover mock/direct-call/codex actor profiles. |
| Direct-call host/provider/auth conflicts | Fixed by rejecting conflicting direct-call host/provider authority and inherited OAuth auth in the route projection helper. | `review-execution-route.test.ts` covers conflicting host/provider and OAuth direct-call failure. |
| Direct-call absent actor selection | Fixed by leaving actor provider/auth unresolved in actor profiles so preflight and artifact truth use the same predicate. | `materializers-effort-persist.test.ts` covers direct-call actor profiles with no LLM selection. |
| Stalled review worker timeout | Fixed inside the existing unit-dispatch failure model. No new public concept, config input, or compatibility path was introduced. | `e2e-codex-multi-agent-fixes.test.ts` covers a hung deliberation unit writing halted execution result without synthesize. |
| Issue-artifact failure closure | Fixed inside the existing execution-result/review-run-manifest path. Malformed output still returns the existing structured MCP failure after writing halt artifacts. | `e2e-codex-multi-agent-fixes.test.ts` covers issue-ledger worker failure; `mcp-review-conformance.ts` asserts malformed output exposes `review-run-manifest` route visibility. |
| Prepared route visibility | Fixed by treating top-level route visibility as an agreed summary, not the first actor profile. Actor-divergent facts remain in `actorProfiles`. | `route-visibility.test.ts` covers divergent actor profiles producing `runtimeProvider=null` while preserving actor profiles. |
| Direct-call unresolved recovery token | Fixed by reusing `safe_after_input_change`; no new retry safety enum was added. | `review-invoke.ts` pre-dispatch actor route failure branch. |
| Retry timing prose | Fixed by aligning the comment with the linear retry delay currently implemented. Structural retry evidence remains a design follow-up. | `run-review-prompt-execution.ts` retry comment. |
| Timeout truth wording | Fixed by narrowing active docs: stalled timeout closes through halted execution-result/run-manifest artifacts, not a timeout-specific structured failure record. | `IMPLEMENTATION_MAP.html` and `docs/architecture/mcp-native-tool-surface.md`. |
| Problem-framing fixture repair | Fixed by reusing the existing `closure_obligation` token set instead of introducing `monitor` as a new near-duplicate value. | The fixture uses `out_of_scope`; validator remains fail-loud for unsupported tokens. |
| Broader provider vocabulary cleanup | Deferred to avoid widening the active concept surface before the public naming contract is designed. | `issue-004` remains a planned follow-up, scoped to provider/host naming. |

Remaining verification gap:

- Rerun the full live concept-economy review once more after the latest issue-artifact/route-visibility closure if the goal requires review evidence on the final diff, not only targeted/MCP/e2e evidence.
