# MCP-Native Tool Surface

The product goal is for Codex, Claude, and future hosts to call `onto` as a
small set of tools with a stable MCP surface.

## Tool Set

| Tool | Purpose | Primary output |
|---|---|---|
| `onto_review` | Start and optionally run a review | session id, status, run handle, artifact refs, `resultClassificationSummary`, `llmPresentation` prompts |
| `onto_prepare_review` | Materialize interpretation, binding, plan, and prompt packets without executing lenses | execution plan refs, opening brief prompt |
| `onto_review_continue` | Continue a review when `runControl.continuationAvailable` is true without re-running trusted or active units | continuation plan, continuation attempt refs, updated artifact refs, status, or `already_running` decision |
| `onto_review_round` | Host orchestration (B): return the units ready to execute now with prompt packets materialized; onto does not execute them | round result (`in_progress` ready units / `ready_to_assemble` / `halted`), packet refs |
| `onto_review_advance` | Host orchestration (B): report host-executed units; onto validates seats, records results and gates, returns the next round or assembles the `ReviewRecord` | next round result or assembled record refs |
| `onto_review_cancel` | Request cancellation for a running review session | cancellation request artifact ref plus updated status/run-control projection |
| `onto_review_read` | Read a review session: recovery/liveness status while running (`sessionRoot` or `latest=true`), and the bounded result once it completes. Routes by session state, avoiding a missing-record result error on still-incomplete sessions | status/liveness/run-control/continuation projection at `compact`; result projection at `standard`/`full` once the review completes (`completed`/`completed_with_degradation`; `full` adds `review-record.yaml` and `final-output.md`); a running, halted, or failed session returns the status/failure projection |
| `onto_observe_source` | Materialize reconstruct source observations | `target-material-profile.yaml`, `source-inventory.yaml`, `source-observations.yaml`, initial `reconstruct-record.yaml` |
| `onto_validate_reconstruct_directive` | Validate LLM-authored reconstruct directive files | validation artifact with status and violations |
| `onto_reconstruct` | Run the material-aware reconstruct post-Seed artifact loop with direct-call semantic/confirmation realization | post-Seed artifacts, `final-output.md`, `reconstruct-run-manifest.yaml`, `reconstruct-record.yaml` |
| `onto_reconstruct_read` | Read a reconstruct session: stage progress, liveness, count summary at `compact`/`standard`; full record, run manifest, and final output at `full` | record stage, stage progress, liveness, count summary, and artifact refs; `full` adds run manifest and final output text |
| `onto_list` | List a registry by `kind`: `lenses`, `domains`, or `source_profiles` | full/core-axis lens IDs, domain IDs, or source profile refs keyed by `target_material_kind` |

**Profiles & compatibility.** `tools/list` advertises the **full** profile (all 12)
by default; set `ONTO_MCP_PROFILE=simple` (the `.mcpb` desktop bundle) to advertise the
bounded **simple** profile of 8 — `onto_review`, `onto_review_read`, `onto_review_cancel`,
`onto_reconstruct`, `onto_observe_source`, `onto_validate_reconstruct_directive`,
`onto_reconstruct_read`, `onto_list` — which hides advanced orchestration but keeps
cancellation. The pre-consolidation names (`onto_review_status`/`onto_review_result`,
`onto_reconstruct_status`/`onto_reconstruct_result`,
`onto_list_lenses`/`onto_list_domains`/`onto_list_source_profiles`) remain callable as
stable compatibility aliases in either profile but are not advertised.

## Host Usability Roadmap (Planned)

> Status: Accepted direction (2026-06-13). Tool consolidation + profiles (Phase 1
> item 3) **implemented 2026-06-14** and reflected in the Tool Set above (12-tool
> surface + simple/full profiles + deprecated aliases). The remaining Phase 1 items
> (polling acceptance contract, provider `user_config`, `.mcpb` packaging) and all of
> Phase 2 are **not yet implemented**. Extends DD-010. The Tool Set above records
> current behavior; the items below record the decided direction.
> Hardened against onto self-review `20260613-d1c99dba` (6 medium design-completeness
> gaps incorporated: over-window contract, `onto_review_read` responsibility map,
> simple-profile run-control, read-merge basis, Phase 2 authority decomposition, and
> the scope-vs-bundle concept split). Re-reviewed `20260613-da680d10` (converged: the
> original 6 resolved; 2 follow-on themes closed here — `onto_review_cancel` kept in the
> simple profile, and a current-vs-planned read-authority bridge with a stable-alias
> lifecycle). Re-reviewed `20260613-7e2c6adb` (1 residual: the reconstruct run-control
> boundary) then `20260614-1e0adfbe` (**0 findings — converged**); the iteration ran
> 8→6→1→0 medium issues, blocker/high 0 throughout.

Motivation: the stated product goal is "a small set of tools with a stable MCP
surface," but the surface has grown to 16 tools tuned for agentic hosts that have a
filesystem and an auto-polling loop (Claude Code, Codex CLI, Cursor). On claude.ai
the assumptions break differently by host:

- **claude.ai web/mobile**: cannot connect a local stdio server at all; only remote
  MCP servers (public HTTPS, Streamable HTTP transport, OAuth 2.1) are reachable.
  `onto` is unreachable there today.
- **Claude Desktop**: connects via local stdio (`onto register`), but the chat host
  has no auto-poll loop, no project filesystem context, and a heavy hand-edited
  `settings.json` provider prerequisite.

Decision: **Desktop-first, phased.** Phase 1 makes the existing local stdio path
excellent on Claude Desktop without touching the repo/filesystem authority model.
Phase 2 reaches web/mobile via a remote server, which requires a separate
state/authority decision.

### Phase 1 — Desktop usability (local stdio)

Core API, artifacts, and authority model are unchanged. These are MCP-surface and
packaging changes only.

1. **Polling friction.** Chat hosts have no auto-poll loop, so manual status polling
   stalls. Mitigations: raise the bounded synchronous window for the simple profile so
   core-axis reviews finish in-call when possible; enable `notifications/progress` by
   default; collapse the read path to one obvious entry point (`onto_review_read`)
   defaulting to `latest=true` so the host need not carry `sessionRoot`. Track MCP
   Tasks (spec 2025-11-25, call-now/fetch-later) for hosts that support it — it removes
   manual polling entirely; `onto_review_read` polling stays as the fallback. This
   keeps the "MCP native progress is transport only" non-goal intact.

   **Acceptance contract** (simple profile must define this before "done" — raising the
   window must not replace polling friction with an unbounded blocking call):
   - **Bounded wait** — a max synchronous window (name the config source); after it the
     call returns `status: running` + run handle instead of blocking further. Host
     responsiveness takes priority over in-call completion once the bound is reached.
   - **Over-window fallback** — the single one-step recovery call is
     `onto_review_read(latest=true)` (no `sessionRoot` juggling); document it as the one
     "check on it" call.
   - **Degradation** — when `notifications/progress` or MCP Tasks are unavailable, state
     the reduced behavior, its cause, and the `onto_review_read` fallback explicitly
     (per the domain fail-loud / graceful-degradation rule).
   - **Terminal-signal correctness** — the canonical terminal signal is the
     `onto_review_read` lifecycle (`completed`/`halted`/`failed`) or `review-record.yaml`,
     **not** raw `execution-result.yaml`, which is upserted mid-run and can read
     `halted_partial` while the attempt is still active. Polling guidance must say so
     (observed live in review `20260613-d1c99dba`: a raw-artifact poller false-terminates).
2. **Provider prerequisite.** Collect LLM provider config at install time via the
   `.mcpb` `manifest.json` `user_config` (secrets flagged sensitive) instead of
   hand-editing `settings.json`. `user_config` is an **input channel only**: it writes
   into the `settings.json/v3` chain, which remains the sole canonical authority for
   provider/route resolution. No new settings authority or precedence is introduced —
   the bundle UI is a convenience front-end over the same keys.
3. **Tool consolidation + profiles.** ✅ **Implemented 2026-06-14** (`src/mcp/`,
   `tool-surface.test.ts`). Reduce 16 → 12 by merging near-duplicate entry
   points on existing axes (no new operation concepts), and expose a bounded
   **simple** profile for chat hosts vs the **full** profile for agentic hosts.
   Profiles are bounded views over the same Core API (per
   `llm-runtime-interface-principles.md`); host-orchestration tools stay in the full
   profile, not removed.

| Change | From | To | Basis |
|---|---|---|---|
| Read merge | `onto_review_status` + `onto_review_result` | `onto_review_read` (single read surface; see map) | one entry, two read *modes* (recovery/liveness vs terminal disclosure) selected by `projectionLevel` + `latest` — **not** "projectionLevel only" |
| Read merge | `onto_reconstruct_status` + `onto_reconstruct_result` | `onto_reconstruct_read` | same |
| List merge | `onto_list_lenses` / `onto_list_domains` / `onto_list_source_profiles` | `onto_list` (`kind`) | isomorphic "list registry X" |
| Visibility | all 16 exposed | **simple** (8, `.mcpb` desktop) vs **full** (12, CLI/Claude Code) | advanced orchestration (`prepare`/`continue`/`round`/`advance`) hidden in simple; `onto_review_cancel` **kept in simple** (run-control, see below) |

simple profile (8): `onto_review`, `onto_review_read`, `onto_review_cancel`,
`onto_reconstruct`, `onto_observe_source`, `onto_validate_reconstruct_directive`,
`onto_reconstruct_read`, `onto_list`.

**`onto_review_read` responsibility map** (resolves the `*_status`/`*_result` merge).
Read-surface authority (implemented 2026-06-14): `onto_review_read` is the canonical
read/polling surface across this doc; `onto_review_status` / `onto_review_result` are
deprecated aliases (see Profiles & compatibility). The merge is two read *modes* under
one entry point; the merged tool owns both, and it does not drop any `*_status`
responsibility:
- **Recovery/liveness mode** (was `onto_review_status`): `latest=true` recovery,
  run-control/lifecycle state, liveness, continuation visibility, `compact` polling
  payload. This stays the canonical, public, fallback read surface.
- **Terminal disclosure mode** (was `onto_review_result`): bounded result at `standard`,
  full `ReviewRecord` + `final-output.md` at `full`.

On rollout, `onto_review_status` / `onto_review_result` are retained as **stable
compatibility aliases** (not temporary migration shims) that keep their original
behavior via retained legacy handlers — they are not re-pointed at `onto_review_read`
— so existing recovery/continuation references here and in
`review-continuation-surface.md` keep resolving. Lifecycle: aliases persist through the
deprecation window and are removed only at a major tool-surface version bump, with a
migration note — never silently. `onto_reconstruct_read` follows the same split.

**Run-control in the simple profile.** Because the simple profile relies on bounded
synchronous execution, it must still expose recovery **and** cancellation for the
running / stale / over-window / accidental-launch cases. Decision: simple keeps **both**
`onto_review_read` (recovery/`latest`) **and** `onto_review_cancel` (the canonical
active-attempt control) — cancellation is reachable directly from the surface that starts
long runs, not deferred to an escalation. This is why simple is 8 tools, not 7; the other
advanced orchestration tools (`prepare`/`continue`/`round`/`advance`) stay full-only.
Scope: this cancellation-availability rule is currently **review-specific**. reconstruct
in the simple profile exposes `onto_reconstruct_read` (read/liveness) only — there is no
`onto_reconstruct_cancel` in the current surface — so reconstruct active run-control is an
**explicit deferred parity item, not an omission**; a long-running reconstruct is
recovered/observed via `onto_reconstruct_read` until that parity lands.

4. **`.mcpb` packaging.** Ship a Desktop Extension bundle (`manifest.json` + onto
   binary) for one-click install; keep `onto register` for CLI/advanced setup.

### Phase 2 — Remote (web/mobile), direction only

Remote MCP server over Streamable HTTP + OAuth 2.1 to reach web/mobile and desktop
connectors. Target operating model (per product owner): review **bundles of
conceptually-connected, multi-form artifacts** — code plus documents, spreadsheets,
and other material — grouped like a GitHub repo, not a single pasted snippet.

Concept split (keep two concerns distinct): **bundle composition** — `bundleKind` +
`memberRefs` (which artifacts form the bundle and their roles) — is the extension point
for multi-source/multi-material review. `targetScopeKind` only *classifies the target
shape* (`file`/`directory`/`bundle`) and selects the bundle path; membership authority
does not live there. Extending to multi-material bundles means extending
`bundleKind`/`memberRefs` and source resolution, **not** overloading `targetScopeKind`.

This direction is **not implementable as written**: the no-local-filesystem case has an
open state/authority model (source integration vs ephemeral server session) that must be
decided first, preserving "artifact truth is `onto`-owned." Acceptance gate — decide and
specify before Phase 2 implementation:
- **Source authority & permission** — OAuth scope per source, what onto may read, how
  source identity maps into a bundle.
- **Bundle materialization** — how remote sources become a resolved, content-addressed
  member set (the `sha256`-per-ref identity the local path model gives today).
- **Provenance & replay** — how findings cite remote members durably enough to re-open
  or continue a session.
- **Persistence, retention & ownership** — where session artifacts live server-side, who
  owns them, retention/deletion policy.
- **Synchronization** — behavior when a source changes mid-review or between sessions.
- **Validation gate (sink)** — the boundary checks that replace today's realpath /
  filesystem-scope guarantees.
- **Authority transition** — how "artifact truth is `onto`-owned" is enforced when the
  truth location is not the user's repo.

Cross-references: [DD-010](../decisions/DD-010-onto-mcp-native-tool-surface.md)
(MCP-native tool surface decision record), `docs/architecture/repo-layout.md`.

## Long-Running Review Recovery

`onto_review` uses a bounded synchronous window for MCP hosts. Once session
metadata and the execution plan exist, the Core API can return a versioned
`runHandle` with `sessionId`, `sessionRoot`, `requestHash`, current status,
domain resolution, target summary, key artifact refs, and a poll interval.
When the review finishes before that window closes, the response remains the
completed review result. When the window closes first, the response has
`status: running`; execution continues under the same session.

The handle is not review truth. It is a projection over session artifacts plus
active attempt metadata. The artifact truth remains the session root:
`session-metadata.yaml`, `execution-plan.yaml`, `execution-result.yaml`,
`review-run-manifest.yaml`, `review-record.yaml`, and related review artifacts.

`onto_review_read` is the canonical polling and recovery surface (`onto_review_status`
is a deprecated alias). Callers can
pass `sessionRoot`, or pass `latest=true` with optional `target`, `domain`, and
`requestHash` filters to recover the newest matching session under
`projectRoot`. The latest-session lookup does not infer review findings; it only
returns session identity, status, request hash, and artifact refs. The request
hash is a canonical request identity hash derived from session artifacts,
including target scope, bundle refs, resolved domain, review mode, and selected
lenses when available.

Status now exposes `runControl.lifecycleState`, `runControl.activeAttempt`,
`alreadyRunning`, cancellation/continuation availability, retry semantics,
host-timeout semantics, target material support from
`review-target-profile.yaml`, and `environmentWarnings` from
`environment-warnings.yaml` when non-fatal worker warnings are observed.

`onto_review_cancel` writes a session-local `review-cancel-request.yaml`.
Cancellation is cooperative: the runner checks for that request at runtime
cancellation checkpoints and, when observed, closes through
`execution-result.yaml` with `execution_status=halted_partial` and
`halt_phase=cancellation`. Cancellation is accepted only when run-control reports
an active cancellable attempt; prepared, terminal, failed, or stale sessions do
not receive orphan cancellation-request artifacts. This keeps cancellation
separate from host-call timeouts and unit timeouts.

Explicit domain tokens are normalized only for sigil/no-domain syntax before
dispatch. Exact canonical matches proceed; retired aliases and unknown explicit tokens fail before dispatch with
`ReviewDomainTokenResolution.resolution` set to `suggestion` when safe
suggestions exist, or `unknown` when they do not.

Result readers validate resolved `ReviewRecord.final_output_ref` paths against
the session disclosure boundary before returning final output paths or content.
Core API, MCP, and CLI callers share the canonical lexical and realpath-aware
boundary primitive in `src/core-runtime/path-boundary.ts`; each surface only
owns its error shape. Review execution-plan path validation is centralized in
`src/core-runtime/review/execution-plan-boundary.ts` and is used before Core API
continuation and direct prompt-runner dispatch consume plan-owned paths.
Code targets report `targetMaterialSupport.supportStatus="supported"`; document
and mixed material targets remain visible as partial where material-specific
validation is not implemented.

## Review Continuation

Review continuation is the MCP surface for operator-controlled resume of
an existing review session. The canonical design is
`docs/architecture/review-continuation-surface.md`.

The pipeline execution ledger behind this surface is not review-specific. The
shared contract is
`.onto/processes/shared/pipeline-execution-ledger-contract.md`; `review`,
`reconstruct`, future `evolve`, and later onto pipelines should all expose the
same trust/provenance projection through their status and result surfaces.

The public concept is `review_continue`, not subagent management. The runtime
continues artifact-backed review units: lens units, issue artifact units,
per-lens deliberation units, teamlead controlled deliberation, and synthesize.

`onto_review_read` remains the read surface. When
`runControl.continuationAvailable` is true, including prepared, halted, failed
attempt, and stale-active states, it exposes a derived `continuationPlan`
projection: which artifacts are reusable, which unit is missing or failed, which
units would run, a derived pipeline execution ledger that marks artifact trust
boundaries, and whether manifest/context/route validation blocks continuation.

`onto_review_continue`:

- accept `sessionRoot`, optional `projectRoot`, and optional `targetUnits`;
- derive its continuation frontier from the pipeline execution ledger's trust and
  completion boundary;
- normalize public target aliases such as `lens:{lens_id}` and
  `deliberation:{lens_id}` to ledger unit ids, then reject requests that do not
  match the current continuation frontier;
- reuse trusted completed units and reject requests whose target units are
  already trusted;
- derive the minimal continuation frontier when `targetUnits` is omitted;
- preserve malformed or partial failed outputs before replacing them;
- write continuation attempt provenance under the same review session;
- back up session-level execution artifacts before dispatch and restore those
  backups if the continuation attempt fails;
- return `decision: already_running` instead of dispatching when an active
  attempt already owns the requested frontier.

The MCP response is a projection over the Core API `ReviewContinueResult`:
`decision` is `"executed"` or `"already_running"`, while session identity,
status, artifact refs, failure refs, optional continuation attempt/plan facts,
route/presentation projections, and active-attempt facts remain available in the
structured result.

Continuation must not accept `resume_token` as authorization. The token remains
audit/idempotency data.

## Reconstruct Tools

`reconstruct` has a bounded MCP surface. These tools stay runtime-gated and do
not make the runtime an ontology meaning author:

| Tool | Purpose |
|---|---|
| `onto_list` (`kind="source_profiles"`) | list reconstruct source profiles by `target_material_kind` and support status |
| `onto_observe_source` | return deterministic material-structure observations |
| `onto_validate_reconstruct_directive` | validate LLM-authored reconstruct directives |
| `onto_reconstruct` | orchestrate the post-Seed artifact loop through direct-call `semanticAuthorRealization` and `confirmationProviderRealization` |
| `onto_reconstruct_read` | read the current `reconstruct-record.yaml` plus stage progress, liveness, and count summary (`compact`/`standard`); the record, run manifest, progress projection, and final output text at `full` |

These tools should be added through the bounded Core API facade in
`src/core-api/reconstruct-api.ts`. The facade covers source-profile listing,
preparation artifact materialization, directive validation, post-Seed run
orchestration, status, and result reads; MCP schemas should remain a thin
projection over that surface.

`onto_reconstruct_read` should use the same
shared `PipelineExecutionLedger` trust/provenance model when reconstruct
stage validation expands. LLM-authored reconstruct artifacts are not trusted
merely because they exist; the matching runtime validation unit must complete.

Reconstruct MCP schemas must keep `target_material_kind` separate from domain,
medium, target input kind, and review context `source_kind`. The shared goal
contract is `.onto/processes/shared/target-material-kind-contract.md`.

`onto_reconstruct` exposes only the `direct_call` realization for semantic
authoring and confirmation-provider execution. Test-double realizations are not
part of the public MCP workflow surface.

The run manifest records `happy_path_scope.implemented_artifacts` and
`happy_path_scope.deferred_artifacts`. Domain competency admission is active
governing-snapshot truth rather than a separate domain competency selection artifact.
Claim realization, confirmation validation, competency-question assessment,
failure classification, revision proposal, metrics, stop decision, and final
output provenance are implemented in the runtime-gated path.

The post-Seed design is captured in
`.onto/processes/reconstruct/reconstruct-boundary-contract.md` and
`.onto/processes/reconstruct/reconstruct-execution-ux-contract.md`. MCP status
and result shapes should expose bounded stage facts, count summaries, liveness,
and artifact refs so the host LLM can render progress and final output without
creating a separate UI or semantic authority.

Future `evolve` tools are not active. When designed, they must follow
`.onto/processes/evolve/material-kind-adapter-contract.md`: classify
`target_material_kind` before adapter dispatch, fail explicitly for unsupported
or unknown non-code material, and keep design specification content owned by the
host LLM and user-mediated flow.

## Non-Goals

- MCP does not redefine lens semantics.
- MCP does not choose a different artifact contract.
- MCP does not hide degraded runs; status and result tools must expose them.
- MCP stdout is not the user-facing UX contract. Runtime returns bounded facts;
  the host LLM renders opening, progress, halt, and result explanations from
  `llmPresentation` prompt/input pairs.
- MCP native progress is transport only. When a caller supplies
  `_meta.progressToken` on `onto_review`, the server emits
  `notifications/progress` with versioned `ontoReviewProgress` metadata. The
  canonical read surface remains `onto_review_read`, and progress step ids
  come from the shared runtime progress contract projected into
  `review-run-manifest.yaml`.
- MCP does not create a second materiality concept. Result materiality is the
  classification/disclosure projection defined by
  `.onto/processes/review/material-issue-contract.md`. This disclosure is not a
  hot-path gate; blocking is owned only by deterministic runtime
  structural/contract failures.
- MCP does not add generic public concepts for timeout or retry policy. Long
  running review units halt through the existing execution result artifacts;
  host-call timeout leaves the review running under the same session handle;
  malformed output and artifact write failures continue to use structured
  failure records. Review continuation is a bounded artifact-backed continuation
  surface, not a generic retry policy or subagent lifecycle API.
- MCP reconstruct tools expose the LLM-authored semantic artifact workflow. The
  host LLM owns ontology seeds, competency questions, failure classifications,
  revision proposals, and stop decisions; runtime owns structural observation,
  artifact persistence, deterministic validation gates, and bounded status
  projection.

## Provider And Route Selection

In `settings.json/v3`, each actor owns a complete LLM block. Review actors use
`review.execution.actors.*.llm`; reconstruct direct-call actors use
`reconstruct.execution.actors.semantic_author.llm` and
`reconstruct.execution.actors.confirmation_provider.llm`. There is no root
`llm.default`, no root reconstruct LLM setting, and no actor inheritance in the
canonical settings shape. Review execution route selection belongs to
`review.execution.executor`: `auto` derives the route from the actor LLM
selections, auth mode, host availability, and execution topology, while
non-auto settings remain compatibility controls behind the resolved execution
profile. Public route visibility is expressed with canonical fields such as
`execution_route`, `execution_adapter`, `model_provider`, `auth_mode`,
`billing_mode`, `wire_format`, and `model_id`.
Legacy fields such as executor and resolved provider may still be reported for
observability, but they are compatibility projections. The TS route projection
helper is an internal derivation point; MCP entrypoints accept canonical
`executionRoute` only as a bounded override and otherwise report route
visibility after settings-driven derivation.

```text
review requested
        |
        v
parallel isolated lens contexts
        |
        v
controlled_lens_deliberation
        |
        v
synthesize consumes deliberation.md
```

Claude Code Agent Teams can realize the deliberation transport with
SendMessage transport. Other MCP providers realize the same `onto` behavior by
running bounded deliberation packets in separate contexts. `synthesize` is not
the conflict-resolution stage.

Each review unit is bounded by runtime timeout handling. A stalled lens,
issue-artifact, deliberation, or synthesize unit halts through
`execution-result.yaml`, `degradation-summary.yaml`, and
`review-run-manifest.yaml` instead of silently falling back or blocking the
review indefinitely. A later `onto_review_continue` call may continue from those
artifacts only after freshness and eligibility gates pass.

## First Implementation Slice

1. Export a TS core API facade from `src/core-api/`.
2. Keep repository-local npm harnesses available for verification.
3. Add MCP schemas from `src/mcp/tool-schemas.ts`.
4. Keep Codex and direct-call execution inside bounded runtime adapters.
5. Write conformance tests against generated review artifacts.
