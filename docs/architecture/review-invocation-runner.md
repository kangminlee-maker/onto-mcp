# Review Invocation Runner Design

> Status: Design
> Date: 2026-05-28
> Purpose: keep the review runtime independent of legacy CLI adapter shape while
> preserving current artifact truth and MCP behavior.

---

## 1. Goal

Create one typed review invocation runner that the MCP product surface and
internal compatibility adapter can call:

```text
legacy argv adapter      MCP onto.review
        |                     |
        v                     v
    parse argv            parse tool args
        \                   /
         \                 /
          v               v
        ReviewInvocationRequest
                 |
                 v
        runReviewInvocation(request)
                 |
                 v
        ReviewInvocationResult
          /                 \
 legacy render/json    MCP structuredContent
```

The runner owns product runtime orchestration. MCP owns the public transport
surface; the legacy argv adapter is an internal compatibility and test harness.

---

## 2. Current Shape

Current MCP review execution is not shelling out to a CLI command, but it still
calls a legacy adapter-shaped runtime function in process:

```text
src/mcp/server.ts
  -> createOntoReviewCoreApi().runReview(...)
    -> appendCommonReviewArgs(...)
      -> runReviewInvokeCli(argv)
        -> resolveReviewInvokeSetup(...)
        -> startReviewSession(...)
        -> executeReviewPromptExecution(...)
        -> completeReviewSession(...)
        -> parse stdout JSON
```

This works, but it gives `review-invoke.ts` two responsibilities:

1. adapter responsibility: argv parsing, terminal preview, stdout JSON
2. runtime responsibility: target binding, domain selection, route selection,
   session preparation, execution, completion, result projection

That makes MCP correctness depend on legacy text/argv conventions and console
capture.

---

## 3. Target Ownership

| Layer | Owns | Must not own |
|---|---|---|
| `src/core-runtime/review/` | typed request contract, authority and boundary resolution, plan resolution, artifact orchestration, progress events, artifact-to-result projection | transport rendering |
| `src/core-runtime/cli/review-invoke.ts` | argv parsing, terminal preview, progress text rendering, JSON stdout compatibility | review semantics, artifact decisions, artifact projection |
| `src/core-api/review-api.ts` | project-safe facade, typed request mapping, API/MCP response mapping from runner results, presentation prompt inputs | argv construction, console capture, artifact-to-result projection |
| `src/mcp/` | schemas, tool routing, MCP progress notification projection, security disclosure | review runtime semantics, artifact decisions |

Artifact truth remains unchanged:

- `interpretation.yaml`
- `binding.yaml`
- `execution-plan.yaml`
- `execution-preparation/*`
- `review-run-manifest.yaml`
- `execution-result.yaml`
- `review-record.yaml`
- `final-output.md`

The runner returns projections derived from these artifacts. It does not create
a second truth source.

The design is governed by five compact contracts:

1. request/result contract
2. progress event contract
3. boundary and authority resolution contract
4. adapter compatibility and equivalence contract
5. interpretation and binding mapping contract

---

## 4. Core Types

### 4.1 `ReviewInvocationRequest`

Internal typed request accepted by the shared runner.

```ts
export interface ReviewInvocationRequest {
  projectRoot: string;
  ontoHome?: string;
  target: string;
  intent: string;
  targetScopeKind?: "file" | "directory" | "bundle";
  primaryRef?: string;
  memberRefs?: string[];
  bundleKind?: string;
  diffRange?: string;
  domain?: string;
  noDomain?: boolean;
  reviewMode?: "core-axis" | "full";
  lensIds?: string[];
  executorRealization?: "codex" | "mock" | "ts_inline_http";
  confirmValueAlignment?: boolean;
  noWatch?: boolean;
  progressObserver?: ReviewProgressObserver;
}
```

Rules:

- `domain` and `noDomain` remain mutually exclusive.
- `noDomain` is an explicit user decision, not a failed inference fallback.
- omitted domain means the runner may use configured domains or target-based
  inference.
- `projectRoot`, `ontoHome`, `target`, `primaryRef`, `memberRefs`, and
  `diffRange` are boundary-sensitive inputs. They must be resolved before
  artifact writes or executor dispatch.
- adapters may omit fields, but must not invent review semantics. Semantic
  intent and domain relevance still flow through the existing interpretation
  and binding path.
- public MCP schema may stay smaller than this internal shape.

### 4.2 `ReviewInvocationPlan`

Resolved plan produced before artifacts are written.

```ts
export interface ReviewInvocationPlan {
  sessionId: string;
  projectRoot: string;
  ontoHome: string;
  target: ReviewTargetBinding;
  requestText: string;
  domainSelection: ReviewDomainSelection;
  reviewMode: "core-axis" | "full";
  lensIds: string[];
  executionProfile: ResolvedExecutionProfile;
  boundary: ReviewBoundaryResolution;
}
```

The plan is not a new artifact authority. It is the in-memory source used to
write existing artifacts. Plan decisions must be deterministic for the same
request and authority state, except for freshly allocated volatile fields such
as `sessionId` and timestamps.

### 4.3 `ReviewDomainSelection`

In-memory representation of the already-existing domain final selection in
`binding.yaml`.

```ts
export interface ReviewDomainSelection {
  recommendation: string;
  finalValue: string;
  selectionMode:
    | "explicit_token"
    | "project_default"
    | "interactive_selection"
    | "target_inferred"
    | "no_domain_default";
  selectionRequired: boolean;
  reason: string;
  bindingNotes: string[];
}
```

Canonical artifact seat remains `binding.yaml`:

```yaml
domain_final_selection:
  recommendation: "@ontology"
  final_value: ontology
  selection_mode: target_inferred
resolved_session_domain: ontology
binding_notes:
  - "No explicit domain token or configured domain was provided. Selected @ontology because ..."
```

`no_domain_default` must only represent a runtime fallback to no domain. If the
user explicitly declines a domain, use a distinct mode such as
`explicit_no_domain` and persist that meaning in `binding.yaml`.

### 4.4 `PreparedReviewInvocation`

Prepared session returned by `prepareReviewInvocation`.

```ts
export interface PreparedReviewInvocation {
  sessionId: string;
  sessionRoot: string;
  plan: ReviewInvocationPlan;
  artifactRefs: ReviewInvocationArtifactRefs;
  openingBriefInputRef: string;
  sessionMetadataRef: string;
  executionPlanRef: string;
  executionPreparationRefs: string[];
  continuationAvailable: boolean;
  canExecute: boolean;
}
```

The prepared value must be reconstructable from `sessionRoot` and artifacts, or
the staged functions must stay internal/test-only until reconstruction exists.

### 4.5 Execution And Result Values

```ts
export interface ReviewExecutionResult {
  sessionId: string;
  sessionRoot: string;
  status: "completed" | "degraded" | "halted" | "failed";
  executionResultRef?: string;
  reviewRunManifestRef?: string;
  degradationSummaryRef?: string;
  failure?: ReviewInvocationFailure;
}

export interface CompletedReviewInvocation {
  sessionId: string;
  sessionRoot: string;
  status: "completed" | "degraded" | "halted" | "failed";
  artifactRefs: ReviewInvocationArtifactRefs;
  failure?: ReviewInvocationFailure;
}

export interface ReviewInvocationResult {
  sessionId: string;
  sessionRoot: string;
  status: "completed" | "degraded" | "halted" | "failed";
  domainSelection: ReviewDomainSelection;
  route: ReviewExecutionRouteProjection;
  artifactRefs: ReviewInvocationArtifactRefs;
  summary: ReviewInvocationSummary;
  failure?: ReviewInvocationFailure;
}
```

`ReviewExecutionResult` is the execution value consumed by completion.
`ReviewInvocationResult` is the adapter-facing projection derived by
`src/core-runtime/review/` from artifact truth. Do not use "projection" for the
execution value.

Minimum artifact refs:

```ts
export interface ReviewInvocationArtifactRefs {
  interpretationRef: string;
  bindingRef: string;
  sessionMetadataRef: string;
  executionPlanRef: string;
  executionPreparationDirRef: string;
  reviewRunManifestRef?: string;
  executionResultRef?: string;
  reviewRecordRef?: string;
  finalOutputRef?: string;
  degradationSummaryRef?: string;
}
```

---

## 5. Runner API

Recommended module:

```text
src/core-runtime/review/review-invocation-runner.ts
```

Public functions:

```ts
export async function resolveReviewInvocation(
  request: ReviewInvocationRequest,
): Promise<ReviewInvocationPlan>;

export async function prepareReviewInvocation(
  plan: ReviewInvocationPlan,
): Promise<PreparedReviewInvocation>;

export async function executePreparedReviewInvocation(
  prepared: PreparedReviewInvocation,
): Promise<ReviewExecutionResult>;

export async function completeReviewInvocation(
  prepared: PreparedReviewInvocation,
  execution: ReviewExecutionResult,
): Promise<CompletedReviewInvocation>;

export async function runReviewInvocation(
  request: ReviewInvocationRequest,
): Promise<ReviewInvocationResult>;
```

`runReviewInvocation` is a thin composition:

```text
resolve -> prepare -> execute -> complete -> project result
```

The smaller functions stay exported for tests and future continuation work.

`prepareReviewInvocation` accepts a resolved plan. Public request-level prepare
paths should expose a convenience wrapper:

```ts
export async function prepareReviewInvocationRequest(
  request: ReviewInvocationRequest,
): Promise<PreparedReviewInvocation>;
```

That wrapper is only composition:

```text
resolve -> prepare
```

---

## 6. Boundary And Authority Resolution

Boundary resolution runs before artifact writes and before executor dispatch.

Required behavior:

- canonicalize `projectRoot` and reject values outside the product-local
  workspace policy.
- resolve `ontoHome` through the existing authority chain and reject path
  traversal or symlink escapes.
- resolve `target`, `primaryRef`, `memberRefs`, and bundle members against the
  allowed target roots before materialization.
- validate `diffRange` without allowing shell interpolation.
- write artifacts only under the resolved review session root.
- pass an explicit executor permission envelope to provider adapters.
- return rejected-input diagnostics with field name, normalized value when safe,
  reason, and retry safety.

The runner must treat boundary failures as structured failures, not adapter
exceptions with transport-specific text.

---

## 7. Progress Event Contract

The runner emits typed events. Adapters project them to terminal text or MCP
notifications.

```ts
export type ReviewProgressEvent =
  | ReviewProgressPhaseEvent
  | ReviewProgressArtifactEvent
  | ReviewProgressDegradedEvent
  | ReviewProgressFailureEvent;

export interface ReviewProgressEventBase {
  version: 1;
  eventId: string;
  sessionId: string;
  eventKind: "phase" | "artifact" | "degraded" | "failure";
  phase:
    | "resolve"
    | "prepare"
    | "execute"
    | "deliberate"
    | "complete"
    | "project";
  status: "started" | "updated" | "completed" | "degraded" | "failed";
  timestamp: string;
  message?: string;
}

export interface ReviewProgressPhaseEvent extends ReviewProgressEventBase {
  eventKind: "phase";
}

export interface ReviewProgressArtifactEvent extends ReviewProgressEventBase {
  eventKind: "artifact";
  artifactRef: string;
}

export interface ReviewProgressDegradedEvent extends ReviewProgressEventBase {
  eventKind: "degraded";
  failure: ReviewInvocationFailure;
}

export interface ReviewProgressFailureEvent extends ReviewProgressEventBase {
  eventKind: "failure";
  failure: ReviewInvocationFailure;
}

export type ReviewProgressObserver = (
  event: ReviewProgressEvent,
) => void | Promise<void>;
```

Rules:

- events are emitted in causal order per invocation.
- artifact events include an artifact ref and never inline large artifact text.
- degraded and failed events include `ReviewInvocationFailure`.
- adapters must ignore unknown future event kinds with a visible diagnostic,
  not fail closed.
- progress text is derived from events; events are not parsed from console
  output.

---

## 8. Failure And Lifecycle Contract

The runner uses one failure surface across resolve, prepare, execute, complete,
and project phases.

```ts
export interface ReviewInvocationFailure {
  phase:
    | "resolve"
    | "prepare"
    | "execute"
    | "deliberate"
    | "complete"
    | "project";
  failureKind:
    | "invalid_request"
    | "boundary_violation"
    | "authority_resolution_failed"
    | "artifact_write_failed"
    | "provider_failed"
    | "malformed_unit_output"
    | "timeout"
    | "cancelled"
    | "concurrency_conflict"
    | "projection_failed";
  message: string;
  retrySafety: "safe" | "unsafe" | "unknown";
  diagnosticArtifactRef?: string;
  partialArtifactPolicy: "none" | "inspectable" | "resume_supported";
}
```

Lifecycle requirements:

- idempotent retry behavior must be explicit for prepared and running sessions.
- concurrent invocations must not write to the same session root.
- cancellation and timeout must produce terminal progress events and diagnostics.
- malformed LLM output must remain visible through failure artifacts.
- provider execution should record model, prompt, context, output, tool-call, and
  evaluation evidence refs when available.

---

## 9. Interpretation And Binding Mapping

The runner does not replace `InvocationInterpretation` or `InvocationBinding`.
It gives adapters a typed way to enter that existing authority path.

| Decision | Owner | Artifact seat |
|---|---|---|
| user intent wording | `InvocationInterpretation` / adapter input | `interpretation.yaml` |
| explicit domain token | interpretation then runtime binding | `binding.yaml.domain_final_selection` |
| explicit no-domain choice | interpretation then runtime binding | `binding.yaml.domain_final_selection.selection_mode` |
| configured domain | runtime binding | `binding.yaml.domain_final_selection` |
| target-inferred domain | runtime binding with recorded reason | `binding.yaml.domain_final_selection`, `binding_notes` |
| review mode and lens ids | runtime binding from request/config | `binding.yaml`, `execution-plan.yaml` |
| route visibility | derived runtime projection | runner result only |

`resolveReviewInvocation` may make deterministic binding decisions. It must not
invent semantic domain relevance or lens meaning outside the existing authority
documents and target/domain metadata.

---

## 10. Adapter Behavior

### 10.1 Legacy Argv Adapter

`src/core-runtime/cli/review-invoke.ts` should become:

1. parse argv
2. convert to `ReviewInvocationRequest`
3. call `runReviewInvocation`
4. render start preview, progress text, final overview, JSON stdout

Compatibility rules:

- keep existing internal flags only while they are still needed by tests
- keep current final JSON shape during migration
- keep `npm run test:e2e` as the compatibility gate

### 10.2 MCP/Core API Adapter

`src/core-api/review-api.ts` should:

1. convert `PrepareReviewRequest` / `RunReviewRequest` to
   `ReviewInvocationRequest`
2. call `prepareReviewInvocation` or `runReviewInvocation`
3. map runner results to API/MCP response shapes
4. return structured API/MCP shapes

It must not:

- build argv for review execution
- capture console output
- parse legacy adapter stdout JSON
- independently derive artifact-to-result projection

MCP progress should be emitted from typed progress events, not parsed console
lines.

---

## 11. Adapter Compatibility And Equivalence

Compatibility is field-level, not whole-object textual equality.

| Field group | Legacy adapter expectation | MCP/Core API expectation | Equivalence rule |
|---|---|---|---|
| session identity | visible in JSON and logs | visible in structured result | compare shape only; session ids are volatile |
| artifact refs | JSON-compatible paths | structured refs | strict after path normalization |
| domain selection | JSON fields and final output text | structured result and final output text | strict for final value, mode, reason |
| route visibility | JSON route projection | structured route projection | strict |
| progress | terminal text | MCP notifications | compare event facts, not rendered text |
| timestamps/durations | may differ | may differ | ignored or normalized |
| diagnostics | visible in JSON/text | structured failure/diagnostic refs | strict for failure kind and diagnostic refs |

Migration cannot be considered safe until both legacy adapter and MCP/Core API execute
through the shared runner and pass this equivalence oracle.

---

## 12. Migration Plan

### Phase 1 - Extract Pure Planning Helpers

Move implementation out of `review-invoke.ts` without changing behavior:

- target binding
- bundle/diff target materialization plan
- domain selection and target-based inference
- review mode and lens set resolution
- execution profile resolution

Done when:

- helpers live under `src/core-runtime/review/`
- existing legacy adapter tests still pass
- no MCP public shape changes

### Phase 2 - Add Typed Runner

Create `review-invocation-runner.ts` and make it call existing preparation,
execution, completion functions directly.

Done when:

- `runReviewInvocation(request)` can run the full mock review path
- result projection matches current legacy JSON result facts
- artifact refs are still derived from session files
- prepare-only returns a `PreparedReviewInvocation` that can be inspected from
  session artifacts

### Phase 3 - Switch Core API And Legacy Adapter To Runner Authority

Replace:

```ts
runReviewInvokeCli(argv)
withCapturedConsole(...)
parseReviewInvokeOutput(...)
```

with direct runner calls.

Done when:

- `src/core-api/review-api.ts` has no review execution argv construction
- `src/core-runtime/cli/review-invoke.ts` calls the same runner for execution
- MCP `onto.review` behavior is unchanged
- native MCP progress does not depend on console parsing
- legacy adapter/MCP equivalence fixtures pass

### Phase 4 - Thin Legacy Adapter

Reduce `review-invoke.ts` to adapter code.

Done when:

- product logic is owned by `src/core-runtime/review/`
- legacy argv handling remains only as an internal harness when still needed
- no CLI-shaped review command is treated as conceptual runtime authority

---

## 13. Test Gates

Minimum verification for each phase:

```text
npm run check:ts-core
npx vitest run src/core-runtime/cli/review-invoke-auto-resolution.test.ts
npx vitest run src/core-api/review-api.test.ts
npm run test:e2e
```

Before switching MCP/Core API:

```text
npm run test:mcp:review
npm run test:review:hardening
```

Regression expectations:

- explicit `domain` / `noDomain` behavior is unchanged
- omitted domain still supports target-based inference
- `binding.yaml` remains domain selection truth
- prepared sessions still produce opening brief input
- completed sessions still produce ReviewRecord and final output
- malformed unit output and structured failures remain MCP-visible
- route visibility remains a derived projection, not a new authority

Focused fixtures required before implementation proceeds:

- `resolveReviewInvocation` precedence: explicit domain, explicit no-domain,
  configured domain, target-inferred domain, and no-domain fallback.
- boundary rejection for unsafe `projectRoot`, `ontoHome`, target refs, bundle
  refs, and `diffRange`.
- prepare-only artifact refs and opening brief input reconstruction.
- artifact-derived `ReviewInvocationResult` projection.
- progress event ordering, degraded events, failure events, and unknown event
  projection behavior.
- legacy adapter/MCP equivalence fixtures using strict, normalized, and ignored field
  groups.
- provider/realization fixture proving extension without adapter churn.

---

## 14. Risks And Controls

| Risk | Control |
|---|---|
| Legacy adapter and MCP diverge during migration | both adapters call the same runner before deleting old path |
| accidental new artifact authority | runner result must derive from existing artifacts |
| progress regressions | introduce typed progress observer before removing console parsing |
| route visibility drift | keep `buildReviewExecutionRoute` as the single projection helper |
| domain inference overreach | keep explicit/configured domain precedence and record inference reason in `binding_notes` |
| product-local boundary escape | canonicalize and validate all boundary-sensitive inputs before artifact writes |
| brittle plan equality tests | compare deterministic decisions separately from volatile `sessionId` and timestamps |

---

## 15. Non-Goals

- no public `onto review` CLI restoration
- no change to lens output schema
- no change to ReviewRecord authority
- no new MCP tool solely for this refactor
- no provider behavior rewrite
- no continuation/resume implementation in this slice
- no new artifact authority for runner results

---

## 16. Completion Criterion

The refactor is complete when:

1. `src/core-api/review-api.ts` does not call `runReviewInvokeCli`.
2. `src/core-api/review-api.ts` does not construct review execution argv.
3. `src/core-api/review-api.ts` does not parse legacy adapter stdout JSON.
4. `src/core-runtime/cli/review-invoke.ts` is an adapter over
   `runReviewInvocation`.
5. Legacy adapter and MCP produce equivalent review artifacts for the same typed request.
6. boundary, progress, failure, prepare-only, projection, and equivalence
   contracts have focused tests.
7. static, API, E2E, hardening, and MCP conformance tests pass.
