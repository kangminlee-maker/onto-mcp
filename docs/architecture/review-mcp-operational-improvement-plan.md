# Review MCP Operational Improvement Plan

Status: Implemented locally; kept as operational design reference

Date: 2026-05-27

Purpose: close the operational gaps observed while running `onto_review`
through the MCP-native surface, without changing review lens semantics or
creating a second review artifact truth.

Implementation note: the 2026-05-27 local implementation now covers early run
handles, latest-session recovery, active-attempt duplicate guards, bounded
result projections, domain alias preservation, material support disclosure,
environment warning projection, and cooperative cancellation through
`review-cancel-request.yaml`.

## 1. Rechecked Basis

This design is based on a completed historical review session that reviewed
the invocation-runner design note with the `software-engineering` domain. The
reviewed note has since been isolated under `development-records/debug/` because
CLI runner details are not active runtime reference material.

Verified facts:

- `execution-result.yaml` records `execution_status: completed`.
- The run executed 9/9 planned lenses with no degraded lenses and no halt.
- Total runtime was `787089ms`, about 13 minutes.
- Runtime progress followed the 12-step execution contract in
  `review-run-manifest.yaml`.
- `error-log.md` records boundary state with `prompt_declared_only`
  guarantees for web, filesystem, recursive reference expansion, and source
  mutation.
- `review-target-profile.yaml` classified the target as
  `target_material_kind: document` with `support_status: partial`.
- `final-output.md` produced 10 issue clusters for the reviewed design and
  preserved controlled deliberation disagreement.

Operator-observed facts from the MCP session:

- A long-running `onto_review` call exceeded the host tool timeout before the
  run completed.
- The review session continued producing artifacts after the host-level timeout.
- `onto_review_status` and `onto_review_continue` were not useful as immediate
  in-flight recovery surfaces during that long-running window.
- `onto_review_result` worked quickly after the session completed.
- The operator had to discover the session root by searching artifacts when the
  initial tool call timed out before returning a durable handle.

Existing design facts:

- `docs/architecture/mcp-native-tool-surface.md` already names
  `onto_review_status`, `onto_review_continue`, native MCP progress, and
  `llmPresentation`.
- `docs/architecture/review-continuation-surface.md` already designs
  artifact-backed continuation.
- `src/core-api/review-api.ts` already contains progress/liveness projection
  concepts.

Therefore the missing work is not a new review meaning model. The missing work
is a reliable long-running operation contract across `onto_review`,
`onto_review_status`, `onto_review_continue`, and `onto_review_result`.

## 2. Design Goals

- A caller must never lose the session identity when a review outlives the host
  tool timeout.
- Status must be readable while review work is active.
- Continuation must not duplicate already-running units.
- Progress must be available through structured MCP data, not shell polling.
- The final result must remain `review-record.yaml`, `final-output.md`, and
  `execution-result.yaml`.
- The runtime must preserve existing artifact truth, severity/materiality
  semantics, and controlled lens deliberation behavior.

## 3. Non-Goals

- Do not add a generic public subagent lifecycle API.
- Do not make MCP own review semantics, lens selection meaning, or artifact
  truth.
- Do not replace `review-run-manifest.yaml`, `execution-result.yaml`, or
  `review-record.yaml`.
- Do not make timeout/retry a broad product concept outside the review run
  contract.

## 4. Improvement Inventory

| ID | Problem | Improvement |
|---|---|---|
| OR-001 | Long-running `onto_review` can outlive the host call. | Return a durable `ReviewRunHandle` early, then let background execution continue under the same session. |
| OR-002 | Host timeout response can omit session identity. | Emit session identity before long work begins and make timeout-safe responses include the last known handle. |
| OR-003 | Status can be unusable during active execution. | Make `onto_review_status` a lightweight artifact-backed reader with bounded liveness, never a worker wait. |
| OR-004 | `review_continue` can be invoked while a unit is already running. | Add active-attempt detection and return `already_running` instead of dispatching duplicate frontier work. |
| OR-005 | A caller may not know which session was just started. | Add latest-session lookup by target/domain/request hash and expose it from status/result error recovery. |
| OR-006 | Progress is not reliably visible without manual log tailing. | Project runtime progress through native MCP notifications when possible and status polling otherwise. |
| OR-007 | Domain aliases such as `software-development` are not normalized by the tool. | Add domain alias suggestions and record requested token plus normalized domain. |
| OR-008 | Completed results can be too large for ordinary MCP consumption. | Add compact result projections and make full artifact refs available on demand. |
| OR-009 | Boundary enforcement is declared but not fully environment-enforced. | Promote boundary checks for refs, roots, writes, network policy, and rejected input diagnostics. |
| OR-010 | Cancellation, host timeout, unit timeout, retry, and resume semantics are scattered. | Define a bounded run-control policy tied to existing execution artifacts. |
| OR-011 | Active worker state is not visible through MCP. | Expose active units, latest artifact, stale threshold, and current attempt from status. |
| OR-012 | Worker environment warnings can appear as incidental log noise. | Capture non-fatal environment warnings separately from review findings and execution failures. |

## 5. Target Surface

### 5.1 `ReviewRunHandle`

`onto_review` should return or emit a durable handle before dispatching
long-running units:

```ts
interface ReviewRunHandle {
  schemaVersion: "1";
  sessionId: string;
  sessionRoot: string;
  invocationId: string;
  status:
    | "prepared"
    | "running"
    | "completed"
    | "completed_with_degradation"
    | "halted_partial"
    | "failed"
    | "unknown";
  projectRoot: string | null;
  target: {
    requestedTarget: string | null;
    targetScopeKind: string | null;
    targetMaterialKind: string | null;
  };
  domain: {
    requestedToken: string;
    normalizedDomain: string | null;
    resolution: "exact" | "suggestion" | "no_domain" | "unknown";
    suggestionIds: string[];
  };
  artifactRefs: {
    sessionMetadata: string | null;
    executionPlan: string | null;
    reviewRunManifest: string | null;
    executionResult: string | null;
    finalOutput: string | null;
    reviewRecord: string | null;
  };
  requestHash: string | null;
  pollAfterSeconds: number | null;
}
```

The handle is a projection of existing artifacts. It is not a new source of
review truth.

### 5.2 Long-Running Response Rule

`onto_review` should follow a bounded synchronous window:

1. materialize interpretation, binding, execution plan, and session metadata;
2. return or emit `ReviewRunHandle`;
3. continue execution while the host call remains open only when the host can
   accept progress notifications;
4. before the host deadline, return `status: running` with the same handle if
   final artifacts are not ready.

Done when a host-level timeout cannot leave the caller without `sessionRoot`.

### 5.3 Status Read Rule

`onto_review_status(sessionRoot)` must only read artifacts and lightweight
runtime state. It must not wait for a running worker.

Minimum status projection mirrors the exported Core API status shape:

```ts
interface ReviewStatus {
  sessionId: string;
  sessionRoot: string;
  status: "prepared" | "running" | "completed" | "completed_with_degradation" | "halted_partial" | "failed" | "unknown";
  artifactRefs: Record<string, string>;
  pipelineExecutionLedger?: PipelineExecutionLedger;
  continuationPlan?: ReviewContinuationPlan;
  failureRefs: string[];
  structuredFailures: ReviewStructuredFailureRecord[];
  routeVisibility?: ReviewRouteVisibility | null;
  llmPresentation?: LlmPresentationPrompts;
  runControl?: ReviewRunControlProjection;
  targetMaterialSupport?: ReviewTargetMaterialSupportProjection | null;
  environmentWarnings?: ReviewEnvironmentWarningProjection[];
  latestSessionMatches?: ReviewSessionLookupResult[];
}

interface ReviewActiveAttemptProjection {
  attemptId: string;
  attemptKind: "initial_review" | "continuation";
  status: "started" | "completed" | "halted_partial" | "failed";
  sessionId: string;
  sessionRoot: string;
  startedAt: string;
  updatedAt: string;
  activeUnits: string[];
  requestedFrontierUnits: string[];
  latestObservedArtifactRef: string | null;
  staleAfterSeconds: number;
  secondsSinceUpdated: number | null;
  isStale: boolean;
  attemptManifestRef: string;
}

interface ReviewRunControlProjection {
  activeAttempt: ReviewActiveAttemptProjection | null;
  lifecycleState:
    | "prepared"
    | "active"
    | "stale_active"
    | "cancellation_requested"
    | "failed_attempt"
    | "halted"
    | "completed"
    | "unknown";
  alreadyRunning: boolean;
  cancellationAvailable: boolean;
  cancellationRequested: boolean;
  cancellationRequestRef: string | null;
  continuationAvailable: boolean;
  retryAvailable: boolean;
  retrySemantics: "use_review_continue";
  hostTimeoutSemantics: "review_continues_under_session";
  statusReason: string;
}
```

`llmPresentation.progress.input` remains the human-facing progress projection
with step labels, liveness, latest review signal, material support, and warning
facts. `ReviewStatus` is the artifact/API contract; presentation input is a
derived view.

### 5.4 Continue Guard

`onto_review_continue` must reject or no-op when the selected frontier is
already active.

Result shape mirrors the exported Core API result. `decision` is the
decision-bearing field inside the full result, not a standalone response type:

```ts
interface ReviewContinueResult {
  sessionId: string;
  sessionRoot: string;
  decision: "executed" | "already_running";
  status: ReviewStatus["status"];
  continuationPlan?: ReviewContinuationPlan;
  continuationAttempt?: ReviewContinuationAttempt;
  promptExecutionResult?: ReviewPromptExecutionResult;
  artifactRefs: Record<string, string>;
  pipelineExecutionLedger?: PipelineExecutionLedger;
  resultClassificationSummary?: ReviewResultClassificationSummary;
  failureRefs: string[];
  routeVisibility?: ReviewRouteVisibility | null;
  llmPresentation?: LlmPresentationPrompts;
  activeAttempt?: ReviewActiveAttemptProjection;
}
```

Completed units remain non-overwritable. Missing or failed units remain the only
eligible dispatch frontier. `continuationAttempt` and `continuationPlan` are
present when `decision="executed"`. `activeAttempt` is present when
`decision="already_running"`. Invalid frontier requests fail as structured
continuation errors instead of returning an ineligible success result.

### 5.5 Latest Session Lookup

Add a lightweight read helper behind MCP status/result recovery:

```ts
interface ReviewSessionLookupQuery {
  projectRoot: string;
  target?: string;
  domain?: string;
  requestHash?: string;
  createdAfter?: string;
  limit?: number;
}
```

`requestHash` is the canonical request identity hash, not only a coarse
target/intent/domain recovery key. It includes target scope, primary/member
refs, bundle kind, resolved domain, review mode, and selected lenses when those
facts are available from session artifacts.

### 5.6 Progress Transport

Use two paths:

- native MCP `notifications/progress` when the caller supplies
  `_meta.progressToken`;
- `onto_review_status` polling when native progress is unavailable.

Both paths must project the same progress step ids from
`review-run-manifest.yaml.execution_contract.execution_step_ids`.

### 5.7 Domain Alias Normalization

Domain handling should keep canonical domain id authority without alias
normalization:

```ts
interface ReviewDomainTokenResolution {
  requestedToken: string;
  normalizedDomain: string | null;
  resolution: "exact" | "suggestion" | "no_domain" | "unknown";
  suggestionIds: string[];
}
```

If `software-development` is not a domain but `software-engineering` is the
nearest safe candidate, the runtime should fail with suggestions before
dispatch. Manual host-side remapping should not be the only path.

Unknown explicit domain tokens fail before dispatch. When safe candidates exist,
the runtime returns `resolution: "suggestion"` plus `suggestionIds`; otherwise it
returns `resolution: "unknown"` with an empty suggestion list.

### 5.8 Result Projection Levels

`onto_review_result` should support compact and full projections:

- compact: status, classification summary, material issues, key artifact refs;
- standard: compact plus final output text;
- full: ReviewRecord, final output, route visibility, artifact refs, and
  provenance.

Default MCP result should be compact or standard to avoid flooding the host
context. Full artifacts remain available by ref.

`final_output_ref` is still a ReviewRecord field, but result readers must
validate the resolved path against the session/project disclosure boundary
before returning path or content.

### 5.9 Boundary Enforcement

Runtime must preserve the current boundary disclosure and add enforceable gates:

- reject `projectRoot`, `ontoHome`, `target`, `primaryRef`, `memberRefs`, and
  `diffRange` expansions outside allowed roots;
- keep the canonical lexical and realpath-aware containment primitive in
  `src/core-runtime/path-boundary.ts`; Core API, MCP, and CLI surfaces may shape
  their own errors, but should call the shared predicate/realpath helpers;
- verify artifact writes remain under the session root unless explicitly
  allowed;
- keep web research denied unless the review request and policy permit it;
- return structured rejected-input diagnostics through MCP errors.

### 5.10 Run-Control Policy

Run control remains review-specific and artifact-backed:

- host timeout means caller transport expired, not necessarily review halt;
- unit timeout means unit failure and must close through `execution-result.yaml`;
- cancellation should request a halt and write a structured cancellation record;
- retry is only `review_continue` from a trusted artifact frontier;
- resume token remains audit/idempotency data, not authorization.

### 5.11 Active Worker Visibility

Status should derive active worker visibility from durable runtime facts where
possible:

- `review-run-manifest.yaml.worker_units`;
- recent output artifact mtimes;
- active attempt metadata;
- execution result if terminal.

Process inspection may be used only as a best-effort host-local supplement and
must not become artifact truth.

### 5.12 Environment Warning Channel

Worker environment warnings should not be mixed with review findings.

Add an optional artifact:

```text
environment-warnings.yaml
```

Minimum fields:

- warning id;
- source process or worker unit;
- message;
- fatality: `non_fatal` or `fatal`;
- affected capability;
- whether review output trust is affected.

Non-fatal unrelated runtime warnings must stay visible for operations but must
not be promoted into review findings.

## 6. Additional Issues Found During Recheck

These were not part of the original 12-item operational list but should be
tracked.

### AR-001: Document Material Validation Is Partial

The reviewed target was classified as `target_material_kind: document`, but the
target profile says material-specific validation is only partially supported.
This is acceptable for document and mixed targets, but status/result should
surface the limitation clearly when users ask whether a document review is
complete. Code targets are supported by the current review path and should be
reported as `support_status: supported`.

Improvement: include `targetMaterialSupport` in status and result projections.

### AR-002: Existing Docs May Overstate Runtime UX Completeness

The architecture docs describe progress, liveness, and native MCP progress as
active concepts. The actual operator experience still required manual artifact
inspection after host timeout.

Improvement: add conformance tests that exercise host-timeout windows and
status polling during a live long-running review.

### AR-003: Original User Domain Language Can Be Lost

The final artifacts correctly record `@software-engineering`, but the original
user language was `software-development`. Because the host manually mapped it,
the runtime artifacts do not show the original non-canonical token.

Improvement: record requested token, normalized token, and alias/suggestion
decision in binding/session metadata.

### AR-004: Status Needs Current-Run Signals Before Issue Artifacts Exist

During the first lens wave there may be no issue count or materiality signal
yet. Status should still provide useful current-run state: active units,
completed lenses, latest artifact, and next expected step.

Improvement: expose interim signal status separately from final classification.

### AR-005: Operational Tests Need Real Host Timeout Fixtures

Unit and API tests cover progress isolation and continuation concepts, but the
observed failure mode was host/MCP call timeout while the runtime continued.

Improvement: add a conformance fixture with an intentionally delayed worker
that proves early handle return, status polling, no duplicate continuation, and
eventual result retrieval.

## 7. Implementation Slices

### Slice 1: Handle And Status Recovery

- Emit `ReviewRunHandle` as soon as session metadata and execution plan exist.
- Ensure `onto_review_status` can read active sessions without blocking.
- Add latest-session lookup for recovery after a lost handle.
- Add tests for long-running review with early handle retrieval.

Done when a caller can recover a running review after host timeout without shell
access or artifact search.

### Slice 2: Active Attempt And Continue Guard

- Add active-attempt metadata to the review run manifest or a session-local
  attempt artifact.
- Make `onto_review_continue` return `already_running` for active units.
- Preserve current continuation frontier rules for failed or missing units.

Done when repeated continue calls cannot duplicate running work.

### Slice 3: Progress And Result Projections

- Align native progress events and status polling around the same step ids.
- Add compact/standard/full result projection levels.
- Add interim signal projection for pre-issue stages.

Done when a host can render useful progress and final summaries without reading
large artifacts into context by default.

### Slice 4: Boundary, Domain, And Material Disclosure

- Enforce project/session path boundaries for public inputs and artifact writes.
- Add domain alias/suggestion resolution.
- Surface target material support status in progress/result outputs.

Done when invalid roots, unknown domains, and partial material support are
visible before or during dispatch.

### Slice 5: Run Control And Environment Warnings

- Define cancellation as a structured halted result.
- Keep unit timeout as a unit failure, not a host timeout.
- Add `environment-warnings.yaml` for non-fatal worker environment warnings.
- Add host-timeout, cancellation, stale-running, and warning-channel tests.

Done when operational failures are fail-loud without contaminating review
findings.

## 8. Verification Plan

Required checks:

- TypeScript check for any API/schema changes: `npm run check:ts-core`.
- Live review E2E with real LLM/provider dispatch: `npm run test:e2e`.
- MCP schema/route development check: `npm run check:mcp:review`.
- Review route development check: `npm run check:review:route`.
- Focused implementation checks may use fixed input artifacts, but they are
  not completion evidence unless they call the same runtime/provider path:
  - long-running review returns handle before host timeout;
  - status remains responsive while worker units run;
  - continue returns `already_running` during active dispatch;
  - result compact projection stays bounded;
  - domain alias records requested and normalized tokens;
  - rejected path inputs produce structured diagnostics;
  - document material partial support is surfaced;
  - environment warning does not become a review finding.

## 9. Done When

- `onto_review` cannot lose session identity during long-running execution.
- `onto_review_status` is the primary active-run read surface.
- `onto_review_continue` only continues eligible halted or missing frontiers.
- Native progress and polling status expose the same runtime progress truth.
- Result retrieval defaults to bounded output while preserving artifact refs.
- Boundary, domain, material-support, timeout, cancellation, and environment
  warning semantics are documented, implemented, and covered by tests.
