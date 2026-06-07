# Review Continuation Surface

Status: active implementation

Date: 2026-05-27

Owner: operations

## Goal

When a review stops after some context-isolated units have already produced
artifacts, an MCP caller must be able to continue the same review session by
running only the failed or missing review execution units.

Done when:

- completed unit outputs are reused without re-dispatch;
- failed or missing units can be re-dispatched from the existing session
  artifacts;
- continuation derives from artifact-backed ledgers rather than rescanning the
  session ad hoc;
- stale, tampered, or mismatched manifest-governed artifacts stop before
  dispatch;
- downstream artifacts are produced only after their upstream units are present
  and valid;
- the final result remains the same artifact contract:
  `execution-result.yaml`, optional `degradation-summary.yaml`,
  `final-output.md`, and `review-record.yaml`.

## Scope

The public concept is review continuation, not subagent management.

Continuation operates on runtime-owned review units:

- lens units, addressed as `lens:{lens_id}`;
- issue artifact units, addressed by issue artifact id such as
  `finding-ledger` or `problem-framing`;
- per-lens deliberation units, addressed as `deliberation:{lens_id}`;
- the teamlead controlled deliberation unit, addressed as
  `controlled-deliberation`;
- the synthesize unit, addressed as `synthesize`.

The design does not introduce a generic retry policy, a generic timeout policy,
or a public subagent lifecycle API. Timeout and malformed-output semantics still
close through the existing execution result, degradation summary, and structured
failure records.

## Default Method

Use one new MCP tool:

```text
onto_review_continue(sessionRoot, projectRoot?, targetUnits?)
```

`onto_review_status` remains the read surface. It should expose a bounded
`continuationPlan` projection for halted or prepared sessions so the host LLM
can explain what will run before the caller invokes `onto_review_continue`.

This keeps the command surface small:

- `onto_review_status` answers "what is missing or failed?"
- `onto_review_continue` performs the operator-controlled continuation.
- `onto_review_result` remains a completed-result reader.

## Tool Contract

Input:

```ts
interface ReviewContinueToolInput {
  sessionRoot: string;
  projectRoot?: string;
  targetUnits?: string[];
}
```

Rules:

- `sessionRoot` uses the same project-boundary disclosure guard as
  `onto_review_status` and `onto_review_result`.
- `targetUnits` is optional. When omitted, the runtime derives the minimal
  continuation frontier from artifacts and the pipeline execution ledger.
- When provided, target units may use public aliases such as `lens:{lens_id}`,
  `deliberation:{lens_id}`, or `issue-artifact:{artifact_id}`. The normalized
  target set must match the current ledger-derived continuation frontier so a
  caller cannot jump directly to `synthesize` or select only one root lens while
  sibling root lens units are still untrusted.
- Every target unit must be failed, missing, or not yet reached. Completed units
  are rejected rather than overwritten.
- The tool must not accept a `resume_token` as authorization. The existing token
  remains audit/idempotency data only.
- Provider, model, target scope, lens set, domain, and manifest-governed inputs
  are reused from the existing session artifacts. A caller that wants to change
  them must start a new review.

Output:

```ts
interface ReviewContinueResult {
  sessionId: string;
  sessionRoot: string;
  status:
    | "completed"
    | "completed_with_degradation"
    | "halted_partial";
  continuationPlan: ReviewContinuationPlan;
  executedUnits: ReviewContinuationUnit[];
  reusedUnits: ReviewContinuationUnit[];
  skippedUnits: ReviewContinuationUnit[];
  artifactRefs: Record<string, string>;
  resultClassificationSummary: ReviewResultClassificationSummary;
  routeVisibility: ReviewRouteVisibility;
  llmPresentation: {
    progress: LlmPresentationPrompt;
    halt?: LlmPresentationPrompt;
    finalResult?: LlmPresentationPrompt;
  };
}
```

## Continuation Plan

`ReviewContinuationPlan` is a derived projection. It is not a second source of
review truth.

Minimum fields:

```ts
interface ReviewContinuationPlan {
  schemaVersion: "1";
  sessionId: string;
  eligible: boolean;
  ineligibleReason: string | null;
  sourceRefs: string[];
  validationRefs: string[];
  unitLedger: PipelineExecutionLedger;
  frontierUnits: ReviewContinuationUnit[];
  downstreamUnits: ReviewContinuationUnit[];
  preservedArtifactRefs: string[];
  supersededArtifactRefs: string[];
}

interface ReviewContinuationUnit {
  unitId: string;
  unitKind: "lens" | "issue_artifact" | "deliberation" | "synthesize";
  lensId?: string | null;
  packetPath: string | null;
  outputPath: string | null;
  priorStatus: "missing" | "failed" | "not_reached" | "completed";
  dispatchDecision: "run" | "reuse" | "skip" | "reject";
  reason: string;
}
```

## Pipeline Execution Ledger In Review

The shared contract is
`.onto/processes/shared/pipeline-execution-ledger-contract.md`.
Review continuation consumes that shared ledger shape with review-specific unit
ids and source artifacts.

The review path already creates semantic ledgers:

- `finding-ledger.yaml` records surface findings from Round 1 lens outputs.
- `issue-ledger.yaml` records root-cause issue clusters derived from finding
  graph artifacts.

Those ledgers explain what the review found. They do not by themselves prove
that the execution path that produced each downstream artifact was complete,
valid, or trustworthy.

The primary purpose of the pipeline execution ledger is trust and provenance:

- verify whether the process that produced an artifact completed cleanly;
- identify which outputs are trustworthy when execution halted;
- identify the first unit whose output is missing, failed, stale, or invalid;
- show which downstream artifacts are untrusted because their upstream unit did
  not complete;
- define where continuation should begin after operator approval.

Continuation is a consumer of this ledger, not its only reason to exist.

In the first implementation slice this ledger should be a derived projection,
not a new authority file. The shared ledger model supplies `status`,
`trustStatus`, `trustReason`, artifact refs, packet refs, hashes, attempts, and
upstream/downstream unit ids.

The review ledger projection is derived from:

- `execution-plan.yaml` for planned seats and output paths;
- `review-run-manifest.yaml.worker_units` for registered packets, packet hashes,
  and worker status when present;
- `execution-result.yaml` per-unit execution result arrays;
- `lens-completion-barrier.yaml` for lens completion/missing/failure identity;
- `finding-ledger.yaml` and `issue-ledger.yaml` existence/validity for
  downstream issue-stage completion;
- canonical output file existence and hashes.

The derived ledger should be exposed from `review_status` for halted or
prepared sessions, included in `continuationPlan`, and persisted inside each
`continuation-attempts/{attempt_id}/continuation-plan.yaml`.

Do not add a root-level review-specific ledger until consumers need a durable
standalone audit artifact. If promoted later, prefer the shared durable artifact
policy from `pipeline-execution-ledger-contract.md`; the durable ledger
should still be derived from the same runtime sources rather than become a
second execution truth.

The plan is derived from:

- `execution-plan.yaml`;
- `review-run-manifest.yaml`;
- `execution-preparation/review-context-manifest.yaml`;
- `execution-result.yaml`;
- `lens-completion-barrier.yaml` when present;
- the existence and validity of known output seats.

## Freshness Gate

Before any continuation dispatch, the runtime must validate:

- manifest schema version;
- source hash for every required `context_source`;
- packet hash for every registered packet ref;
- consumer id admission;
- consumed context eligibility;
- generated packet refs before invoking issue-artifact, deliberation, or
  synthesize units;
- route visibility consistency with the existing execution plan and actor
  invocation profiles.

Any mismatch writes a structured failure record and returns before dispatch.

Preferred failure details:

- `manifest_lifecycle` for stale or invalid lifecycle state;
- `context_eligibility` for consumer/context violations;
- `actor_route` for provider or route drift;
- `artifact_write` for failed attempt promotion.

## Dispatch Rules

The runtime follows the existing progress step graph:

```text
manifest_validation
-> lens_dispatch
-> lens_completion_barrier
-> finding_ledger
-> finding_relation_graph
-> issue_ledger
-> issue_stance_matrix
-> deliberation_plan
-> lens_deliberation_responses
-> controlled_deliberation
-> problem_framing
-> synthesize
```

Continuation starts at the earliest incomplete or failed step.

Completed upstream units are reused. Missing or failed units at the frontier are
run. Downstream steps run only when all upstream outputs required by their
packet and artifact contract are present.

If a failed unit has an existing malformed or partial output file, the runtime
must preserve it before replacement. The runtime also backs up session-level
execution artifacts such as `execution-result.yaml`,
`review-run-manifest.yaml`, optional `degradation-summary.yaml`, and final or
record outputs when present. If dispatch or validation fails, copied artifacts
are restored and the failed attempt manifest records
`restored_artifact_backups`.

Completed outputs are never overwritten in the first implementation slice.
Force-rerunning completed units is deferred because it requires explicit
downstream invalidation and audit semantics.

## Attempt Provenance

Continuation needs attempt provenance, but it should stay inside runtime
artifacts.

Recommended filesystem seat:

```text
.onto/review/{session_id}/continuation-attempts/{attempt_id}/
  continuation-plan.yaml
  continuation-attempt.yaml
  superseded-artifacts/
```

`continuation-attempt.yaml` records attempt-local provenance:

```yaml
attempt_id: 20260527-abcdef12
created_at: 2026-05-27T00:00:00+09:00
status: completed
target_units:
  - deliberation:logic
continuation_plan_ref: .onto/review/.../continuation-plan.yaml
superseded_artifact_backups:
  - sourceRef: .onto/review/.../execution-result.yaml
    backupRef: .onto/review/.../superseded-artifacts/001-execution-result.yaml
execution_route_provenance:
  execution_route: external_oauth_worker
  requested_execution_route: external_oauth_worker
  # Compatibility/debug projection; consumers should prefer execution_route.
  executor_realization: codex
  requested_executor_realization: null
  review_execution_profile_source: review-run-manifest
```

The session-level `execution-result.yaml` remains the aggregate current truth
after a successful continuation attempt. Attempt files preserve replay evidence.

## Status Presentation

`onto_review_status` should expose a read-only continuation projection when a
session is `halted_partial` or `prepared`.

The host-facing presentation should say:

- which unit stopped or is missing;
- which already-produced artifacts will be reused;
- which units will run if continuation is invoked;
- which completed artifacts are absent and why;
- whether continuation is blocked by stale or mismatched artifacts.

The presentation must not invent findings, severity, elapsed time, or model
facts. It should use only artifact-backed inputs.

## Implementation Slices

1. `ReviewContinuationPlan` derivation is implemented in the core runtime and
   exposed from `getReviewStatus`.
2. `continueReview` in `src/core-api/review-api.ts` calls the same bounded
   prompt execution runtime used by the CLI path.
3. `onto_review_continue` is exposed in MCP schemas and server dispatch.
4. Conformance covers halted malformed-output continuation and session-level
   backup provenance. Target selection, alias normalization, and session
   boundary guards are covered by focused unit tests.
5. A repository-local CLI harness remains deferred unless debugging needs a thin
   wrapper over the same core API.

## Deferred

- Force-rerun of completed units.
- Changing provider/model/domain/lens set during continuation.
- Cross-session artifact import.
- Generic subagent monitoring.
- Retry analytics beyond per-attempt provenance.
