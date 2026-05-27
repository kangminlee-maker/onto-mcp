# 2026-05-27 Review MCP Operational Improvement Work Design

Status: implemented and locally verified

Goal: complete the `onto.review` MCP operational improvement work so a
long-running review can be started, monitored, recovered, continued, and read
through MCP without losing session identity, duplicating running units, or
creating a second review artifact truth.

Source plan:

- `docs/architecture/review-mcp-operational-improvement-plan.md`

Evidence basis:

- observed review session: `.onto/review/20260527-9e0a2667`
- target reviewed in that session:
  `docs/architecture/review-invocation-runner.md`
- active surface docs:
  `docs/architecture/mcp-native-tool-surface.md`
  and `docs/architecture/review-continuation-surface.md`
- existing Core API concepts:
  `src/core-api/review-api.ts`

Implementation progress as of 2026-05-27:

- Implemented and locally verified: early running handle, MCP latest-session
  recovery, active-attempt run control, duplicate `review_continue`
  `already_running` decision, compact/standard/full `review_result`
  projections, `software-development -> software-engineering` alias
  preservation, target material support disclosure, and non-fatal environment
  warning projection.
- Implemented cancellation request semantics: `cancelReview`/`onto.review_cancel`
  writes `review-cancel-request.yaml`, the runner observes the request at
  runtime cancellation checkpoints, and terminal cancellation closes through
  `execution-result.yaml` with `execution_status=halted_partial` and
  `halt_phase=cancellation`.
- Verified commands:
  `npm run check:ts-core`,
  `npm run build:ts-core`,
  `npx vitest run src/core-api/review-api.test.ts`,
  `npm run test:mcp:review`,
  `npm run test:review:hardening`,
  `npm run test:e2e`,
  `git diff --check`.
- Gates A-E are closed for the local mock/runtime/MCP product path. Live
  provider output quality remains a separate verification concern only when
  intentional live provider credentials/endpoints are used.
- Follow-up implementation review `.onto/review/20260528-8a7c272b` identified
  medium-or-higher closure issues in domain suggestions, active handle docs,
  result disclosure, run-control lifecycle, request identity, warning
  provenance, and supported-code material fixtures. The remediation pass adds
  artifact-derived full request identity, explicit domain suggestion/unknown
  errors, final-output boundary validation, richer run-control lifecycle facts,
  cancellation eligibility guards, runner-scoped warning capture, supported
  code material status, and focused fixtures for these paths.
- Second follow-up review `.onto/review/20260528-282ce009` found two remaining
  medium issues in active contract documentation and duplicated path-boundary
  helpers. The closure pass aligns the operational plan with exported Core API
  `ReviewStatus`, `ReviewRunControlProjection`, `ReviewActiveAttemptProjection`,
  and `ReviewContinueResult` shapes, and extracts lexical/realpath containment
  into `src/core-runtime/path-boundary.ts` for Core API, MCP, and CLI callers.
  It also centralizes review execution-plan ref validation in
  `src/core-runtime/review/execution-plan-boundary.ts` and applies that gate to
  direct prompt-runner execution before outputs are cleared or dispatched.

## 1. Done When

The whole work is complete when:

- `onto.review` returns or emits a durable review run handle before
  host-timeout-prone work starts.
- A caller can recover the session with only MCP tools after the host call
  times out or disconnects.
- `onto.review_status` is a lightweight artifact-backed read path for prepared,
  running, halted, completed, and unknown sessions.
- `onto.review_continue` cannot duplicate already-running work and only
  continues eligible failed, missing, or not-yet-reached frontiers.
- Native MCP progress and polling status expose the same runtime progress step
  ids and liveness model.
- `onto.review_result` supports bounded result projections while preserving
  artifact refs for full inspection.
- Domain alias/suggestion handling records original requested domain text and
  normalized canonical domain decisions.
- Public inputs and artifact writes are checked against project/session
  boundaries before dispatch.
- Host timeout, unit timeout, cancellation, retry/continue, and stale-running
  semantics are explicitly separated.
- Non-fatal worker environment warnings are captured without becoming review
  findings.
- Document material support limitations are visible in status/result.
- The new behavior is covered by focused tests plus the existing MCP, hardening,
  and TypeScript checks.

## 2. Work Units

| ID | Work unit | Intended result | Done criteria | Verification | Depends on |
|---|---|---|---|---|---|
| W0 | Contract lock | Existing concepts stay canonical: ReviewRecord, execution-result, review-run-manifest, review_status, review_continue, llmPresentation, PipelineExecutionLedger. | No new competing artifact truth or generic subagent lifecycle concept is introduced. Source plan and active docs agree on concept seats. | Review docs with `rg "ReviewRunHandle|ReviewStatus|ReviewRunControlProjection|already_running|environment-warnings" docs development-records src`; no duplicate concept with conflicting authority. | none |
| W1 | Early run handle | `onto.review` can produce a durable handle as soon as session metadata and execution plan exist. | Handle includes session id/root, invocation id, status, target summary, domain selection, core artifact refs, and poll recommendation. The handle is derived from artifacts. | Unit test for run handle construction from prepared session artifacts; MCP conformance fixture asserts handle exists before delayed worker dispatch. | W0 |
| W2 | Timeout-safe review response | Host timeout cannot strand the caller without a session handle. | Long-running call returns `status=running` with the same handle before the host deadline when final artifacts are not ready. | Delayed-worker MCP fixture with host-call budget lower than review duration; assert session can be polled by returned handle. | W1 |
| W3 | Lightweight status reader | `onto.review_status` reads artifacts and lightweight runtime state without waiting on workers. | Prepared, running, halted, completed, and unknown sessions return bounded status. Status includes progress, liveness, latest review signal, artifact refs, and run-control facts. | Core API tests for each status state; MCP status test while worker is still running; assert response latency stays bounded. | W1 |
| W4 | Latest session recovery | Lost-handle recovery can find recent sessions by project, target, domain, and request hash. | Internal lookup returns newest matching sessions with enough refs for host recovery. It does not infer semantic result truth. | Fixture starts a review, drops the first response, then resolves latest session by target/domain and polls status. | W1, W3 |
| W5 | Active attempt metadata | Runtime exposes which attempt/frontier is currently active. | Active attempt id, active unit ids, latest artifact, and stale threshold can be derived from session artifacts or attempt metadata. Process inspection remains non-authoritative. | Unit tests for active, stale, completed, and absent active-attempt states. | W3 |
| W6 | Continue already-running guard | `onto.review_continue` refuses duplicate dispatch for active units. | Continue returns `decision=already_running` with active attempt/unit facts when the requested frontier is already active. Trusted completed units remain rejected. | Continuation tests for active lens, active issue artifact, active deliberation, active synthesize, completed-unit rejection. | W5 |
| W7 | Unified progress projection | Native MCP progress and polling status share step ids, labels, total count, and liveness categories. | Progress comes from `review-run-manifest.yaml.execution_contract`; console parsing is not the only progress source. | Progress contract tests; MCP native progress fixture with `_meta.progressToken`; polling status fixture without native progress. | W3 |
| W8 | Interim review signals | Status provides useful current-run signal before issue artifacts exist. | Lens-stage status shows completed/planned/active lenses, latest artifact, and next expected step even when finding/issue counts are null. | Running lens-wave fixture; assert `interim_signal_status` and active/completed lens facts are present. | W3, W7 |
| W9 | Bounded result projections | `onto.review_result` supports compact, standard, and full projections. | Default result does not flood host context; compact includes status, classification summary, material issues, and key refs; full remains available. | API/MCP tests for projection levels and field boundaries; snapshot size guard for compact projection. | W3 |
| W10 | Domain alias/suggestion resolution | Non-canonical user domain text is handled by runtime, not only host judgment. | Exact, alias, suggestion, and unknown resolutions are represented. Original requested token and normalized domain are recorded in session/binding-visible projection. | Unit tests for `software-development -> software-engineering`, exact domain, unknown domain with suggestions, and explicit failure when no safe alias exists. | W0 |
| W11 | Boundary enforcement | Public request refs and writes are checked before dispatch. | `projectRoot`, `ontoHome`, target refs, member refs, diff range materialization, and artifact writes stay inside allowed roots/session seats or fail with structured diagnostics. | Boundary unit tests with path traversal, external absolute path, symlink if supported, invalid diff target, and illegal write seat. | W0 |
| W12 | Run-control policy | Host timeout, unit timeout, cancellation, retry, and continuation have separate semantics. | Host timeout leaves review running; unit timeout writes failed unit/halted artifacts; cancellation writes structured halted/cancelled state; retry means `review_continue`; resume token is not authorization. | Hardening fixtures for host timeout, unit timeout, cancellation request, retry/continue, and resume-token non-authorization. | W2, W6, W11 |
| W13 | Environment warning channel | Non-fatal worker environment warnings are separated from review findings. | Optional `environment-warnings.yaml` records warning id, source, message, fatality, affected capability, and output-trust impact. Final review findings do not include unrelated environment warnings. | Fixture injects a non-fatal worker warning; assert warning artifact exists and finding ledger/review result are unaffected. | W3 |
| W14 | Target material support disclosure | Document material partial support is visible to callers. | Status/result exposes `targetMaterialSupport` from `review-target-profile.yaml`; partial support does not imply failed review but is not hidden. | Status/result tests for document partial support and supported code target. | W3, W9 |
| W15 | MCP schema and server alignment | MCP schemas expose the new bounded projections without moving review semantics into MCP. | `onto.review`, `onto.review_status`, `onto.review_continue`, and `onto.review_result` schemas match Core API outputs and preserve project-boundary disclosure. | `npm run test:mcp:review`; targeted schema tests for projection levels and already-running continue decision. | W1-W14 |
| W16 | Documentation closure | Active architecture docs and implementation map point to the finished operational contract. | Architecture plan, MCP surface doc, continuation doc, Core API README, and implementation map reflect implementation truth. | Path/link checks; `git diff --check`; documentation review against source plan. | W15 |
| W17 | Release readiness verification | Existing and focused checks pass together. | TypeScript, MCP, hardening, E2E where needed, and focused fixtures pass. Any unverified live-provider risk is explicitly recorded. | Full verification command set in section 6. | W16 |

## 3. Dependency Order

Recommended sequence:

1. W0 contract lock.
2. W1 early run handle.
3. W2 timeout-safe review response.
4. W3 lightweight status reader.
5. W4 latest session recovery.
6. W5 active attempt metadata.
7. W6 continue already-running guard.
8. W7 unified progress projection.
9. W8 interim review signals.
10. W9 bounded result projections.
11. W10 domain alias/suggestion resolution.
12. W11 boundary enforcement.
13. W12 run-control policy.
14. W13 environment warning channel.
15. W14 target material support disclosure.
16. W15 MCP schema and server alignment.
17. W16 documentation closure.
18. W17 release readiness verification.

Parallel-safe work:

- W10 can proceed after W0 while W1-W9 progress.
- W11 can proceed after W0 and should finish before W12.
- W13 and W14 can proceed after W3 defines status/result projection seats.
- W16 should stay late so docs describe implementation truth.

## 4. Completion Gates

### Gate A: Recoverable Start

Includes W1-W4.

Complete when:

- a review session handle exists before long-running work;
- caller can poll status with the handle;
- caller can recover a recent session if the handle was lost.

Verification:

```bash
npx vitest run src/core-api/review-api.test.ts
npm run test:mcp:review
```

Focused fixture requirement:

- delayed worker exceeds host-call window;
- handle or lookup recovers the same session;
- status reads running session without blocking.

### Gate B: Safe Continuation

Includes W5-W6.

Complete when:

- active units are visible through status;
- `review_continue` returns `already_running` for active frontiers;
- completed trusted units cannot be overwritten.

Verification:

```bash
npx vitest run src/core-api/review-api.test.ts
npm run test:mcp:review
```

Focused fixture requirement:

- running issue artifact cannot be duplicated;
- completed lens unit is rejected as a continuation target;
- halted missing frontier remains continuable.

### Gate C: Usable Progress And Results

Includes W7-W9, W14.

Complete when:

- progress events and status polling share step ids;
- pre-issue stages expose interim signals;
- result projections are bounded by default;
- target material partial support is visible.

Verification:

```bash
npx vitest run src/core-api/review-api.test.ts
npm run test:mcp:review
```

Focused fixture requirement:

- status during lens execution shows active/completed lens facts;
- compact result includes classification summary and material issues only;
- full result remains available when requested.

### Gate D: Input Safety And Runtime Control

Includes W10-W13.

Complete when:

- domain alias/suggestion decisions are recorded;
- public path inputs and writes are enforced;
- host timeout, unit timeout, cancellation, retry, and continuation are distinct;
- non-fatal worker warnings do not contaminate review findings.

Verification:

```bash
npm run test:review:hardening
npm run test:mcp:review
npx vitest run src/core-api/review-api.test.ts
```

Focused fixture requirement:

- `software-development` resolves or suggests `software-engineering` through
  runtime-owned alias logic;
- external path input fails before dispatch;
- cancellation writes halted/cancelled state;
- injected warning appears only in warning surface.

### Gate E: Product Closure

Includes W15-W17.

Complete when:

- MCP schemas and server output match Core API projection truth;
- active docs and implementation map reflect actual behavior;
- all required checks pass.

Verification:

```bash
npm run check:ts-core
npm run build:ts-core
npm run test:mcp:review
npm run test:review:hardening
npm run test:e2e
git diff --check
```

If live provider credentials are not intentionally available, record that as
residual verification risk rather than blocking local product closure.

## 5. Issue Coverage Matrix

| Issue | Covered by |
|---|---|
| OR-001 long-running call outlives host | W1, W2, Gate A |
| OR-002 timeout response lacks session identity | W1, W2, W4, Gate A |
| OR-003 status unusable during active execution | W3, Gate A |
| OR-004 continue while unit is running | W5, W6, Gate B |
| OR-005 caller cannot identify just-started session | W4, Gate A |
| OR-006 progress requires manual log tailing | W7, W8, Gate C |
| OR-007 domain alias not normalized | W10, Gate D |
| OR-008 completed result too large | W9, Gate C |
| OR-009 boundary enforcement prompt-declared only | W11, Gate D |
| OR-010 run-control semantics scattered | W12, Gate D |
| OR-011 active worker state invisible | W5, Gate B |
| OR-012 environment warnings mixed with logs | W13, Gate D |
| AR-001 document material validation partial | W14, Gate C |
| AR-002 docs overstate UX completeness | W16, Gate E |
| AR-003 original domain language can be lost | W10, Gate D |
| AR-004 weak pre-issue current-run signal | W8, Gate C |
| AR-005 missing host-timeout fixtures | W2, W17, Gate A/E |

## 6. Verification Command Set

Minimum local verification before claiming completion:

```bash
npm run check:ts-core
npm run build:ts-core
npm run test:mcp:review
npm run test:review:hardening
npm run test:e2e
git diff --check
```

Focused tests to add during implementation:

```text
review early handle / delayed worker fixture
review status running-session fixture
review latest-session lookup fixture
review continue already-running fixture
review compact result projection fixture
review domain alias fixture
review boundary rejection fixture
review cancellation fixture
review environment warning fixture
review material-support disclosure fixture
```

Semantic verification assertions:

- A host timeout never marks `execution_status=halted_partial` by itself.
- A unit timeout always records failed unit identity and closes through review
  execution artifacts.
- A running review has exactly one active attempt identity for a given frontier.
- `review_continue` never overwrites a trusted completed unit.
- Status never waits for a worker process.
- Compact result never becomes the ReviewRecord authority.
- Domain alias resolution preserves the user's original token.
- Boundary rejection happens before worker dispatch.
- Environment warnings are operational facts, not findings.
- Material support disclosure is visible but does not reclassify severity.

## 7. Handoff Rules

When handing off unfinished work:

- report the highest completed gate;
- list incomplete work units by id;
- include the latest verification commands and results;
- include any known dirty unrelated files separately;
- preserve artifact refs for any generated review sessions used as evidence.

When marking the goal complete:

- every work unit W0-W17 must be complete;
- every gate A-E must be verified;
- active docs must match runtime behavior;
- any live-provider gaps must be explicitly recorded as out-of-scope or
  residual risk.
