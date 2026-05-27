# Review Invocation Runner Design

> Status: Design
> Date: 2026-05-27
> Purpose: make the review runtime independent of the CLI-shaped
> `review:invoke` path while preserving current artifact truth and MCP behavior.

---

## 1. Goal

Create one typed review invocation runner that both public adapters can call:

```text
CLI review:invoke        MCP onto.review
      |                       |
      v                       v
  parse argv              parse tool args
      \                     /
       \                   /
        v                 v
        ReviewInvocationRequest
                 |
                 v
        runReviewInvocation(request)
                 |
                 v
        ReviewInvocationResult
          /                 \
   CLI render/json      MCP structuredContent
```

The runner owns product runtime orchestration. CLI and MCP own only their
transport surfaces.

---

## 2. Current Shape

Current MCP review execution is not shelling out to `npm run review:invoke`, but
it still calls the CLI-shaped runtime function in process:

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

That makes MCP correctness depend on CLI text/argv conventions and console
capture.

---

## 3. Target Ownership

| Layer | Owns | Must not own |
|---|---|---|
| `src/core-runtime/review/` | typed request, plan resolution, artifact orchestration, execution result projection | transport rendering |
| `src/core-runtime/cli/review-invoke.ts` | argv parsing, terminal preview, JSON stdout compatibility | review semantics or artifact decisions |
| `src/core-api/review-api.ts` | project-safe API facade, MCP-ready result projection, presentation prompt inputs | argv construction or console capture |
| `src/mcp/` | schemas, tool routing, MCP progress notifications, security disclosure | review runtime semantics |

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
- public MCP schema may stay smaller than this internal shape.

### 4.2 `ReviewInvocationPlan`

Deterministic plan produced before artifacts are written.

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
write existing artifacts.

### 4.3 `ReviewDomainSelection`

Reusable internal concept for the already-existing domain final selection.

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
): Promise<ReviewExecutionProjection>;

export async function completeReviewInvocation(
  prepared: PreparedReviewInvocation,
  execution: ReviewExecutionProjection,
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

---

## 6. Adapter Behavior

### 6.1 CLI Adapter

`src/core-runtime/cli/review-invoke.ts` should become:

1. parse argv
2. convert to `ReviewInvocationRequest`
3. call `runReviewInvocation`
4. render start preview, progress text, final overview, JSON stdout

Compatibility rules:

- keep existing CLI flags unless explicitly retired
- keep current final JSON shape during migration
- keep `npm run test:e2e` as the compatibility gate

### 6.2 MCP/Core API Adapter

`src/core-api/review-api.ts` should:

1. convert `PrepareReviewRequest` / `RunReviewRequest` to
   `ReviewInvocationRequest`
2. call `prepareReviewInvocation` or `runReviewInvocation`
3. read/result-project from artifacts
4. return structured API/MCP shapes

It must not:

- build argv for review execution
- capture console output
- parse CLI stdout JSON

MCP progress should be emitted from typed progress events, not parsed console
lines.

---

## 7. Migration Plan

### Phase 1 - Extract Pure Planning Helpers

Move implementation out of `review-invoke.ts` without changing behavior:

- target binding
- bundle/diff target materialization plan
- domain selection and target-based inference
- review mode and lens set resolution
- execution profile resolution

Done when:

- helpers live under `src/core-runtime/review/`
- existing CLI tests still pass
- no public shape changes

### Phase 2 - Add Typed Runner

Create `review-invocation-runner.ts` and make it call existing preparation,
execution, completion functions directly.

Done when:

- `runReviewInvocation(request)` can run the full mock review path
- result projection matches current CLI JSON result facts
- artifact refs are still derived from session files

### Phase 3 - Switch Core API To Runner

Replace:

```ts
runReviewInvokeCli(argv)
withCapturedConsole(...)
parseReviewInvokeOutput(...)
```

with direct runner calls.

Done when:

- `src/core-api/review-api.ts` has no review execution argv construction
- MCP `onto.review` behavior is unchanged
- native MCP progress does not depend on console parsing

### Phase 4 - Thin CLI

Reduce `review-invoke.ts` to adapter code.

Done when:

- product logic is owned by `src/core-runtime/review/`
- CLI remains a dev harness and compatibility surface
- `review:invoke` is no longer a conceptual runtime authority

---

## 8. Test Gates

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

---

## 9. Risks And Controls

| Risk | Control |
|---|---|
| CLI and MCP diverge during migration | both adapters call the same runner before deleting old path |
| accidental new artifact authority | runner result must derive from existing artifacts |
| progress regressions | introduce typed progress observer before removing console parsing |
| route visibility drift | keep `buildReviewExecutionRoute` as the single projection helper |
| domain inference overreach | keep explicit/configured domain precedence and record inference reason in `binding_notes` |

---

## 10. Non-Goals

- no public `onto review` CLI restoration
- no change to lens output schema
- no change to ReviewRecord authority
- no new MCP tool solely for this refactor
- no provider behavior rewrite
- no continuation/resume implementation in this slice

---

## 11. Completion Criterion

The refactor is complete when:

1. `src/core-api/review-api.ts` does not call `runReviewInvokeCli`.
2. `src/core-api/review-api.ts` does not construct review execution argv.
3. `src/core-api/review-api.ts` does not parse CLI stdout JSON.
4. `src/core-runtime/cli/review-invoke.ts` is an adapter over
   `runReviewInvocation`.
5. CLI and MCP produce equivalent review artifacts for the same typed request.
6. static, API, E2E, hardening, and MCP conformance tests pass.

