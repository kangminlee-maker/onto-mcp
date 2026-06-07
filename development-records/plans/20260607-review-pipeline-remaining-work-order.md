---
as_of: 2026-06-07
status: active
purpose: remaining review pipeline optimization work order after synthesis map-reduce and ReviewRecord digest hardening
owner: review runtime tuning
---

# Review Pipeline Remaining Work Order

## Goal

Finish the current review pipeline optimization cycle in dependency order while
preserving semantic quality, material issue recall, artifact truth, and
fail-loud behavior.

The latest implementation has already moved the pipeline to:

- sidecar lens finding artifacts
- projection-first issue artifacts through `problem-framing.yaml`
- issue-scoped controlled deliberation
- synthesis map-reduce with `synthesis-ledger.yaml` as truth
- runtime-rendered `synthesis.md` and `final-output.md`
- `ReviewRecord` terminal artifact digest authority

## Ordered Work

| Order | Work | Why first/next | Done when | Verification |
|---:|---|---|---|---|
| 1 | Align active docs and implementation map | The code path has moved faster than some planning docs; stale next steps confuse later tuning. | `20260605` plan, `20260606` synthesis design, and `IMPLEMENTATION_MAP.html` all describe the current state and this remaining order. | `git diff --check` |
| 2 | Re-run latest live E2E | Speed and stability claims must be measured on the real MCP/OAuth path after all current structural changes. | A fresh live E2E completes review/status/result/continue/cancel and records runtime, stability, dispatch width, and fixture-specific semantic quality status. | `npm run test:e2e` succeeds |
| 3 | Keep semantic quality fixture scope explicit | The semantic gate protects selected target fixtures; broader target variety is still limited. | Gate output exposes fixture id, scope, and target anchor so benchmark/E2E results cannot be mistaken for a universal quality proof. | focused semantic-quality tests plus live E2E output |
| 4 | Add halted-partial digest/null tests | Subagent found this as low/info: not a material trust bypass, but it strengthens the terminal artifact contract. | Tests prove `halted_partial` keeps absent terminal digest refs null and completed records fail without digest fields. | targeted ReviewRecord/Core API tests |
| 5 | Live provider smoke readiness and run | The default route is OAuth-first Codex worker; live route confidence requires the actual MCP path. | One live smoke run completes or fails with structured route/preflight reason, and continuation preserves settings-owned dispatch width. | hardening readiness plus `npm run test:e2e` |
| 6 | Optional downstream tuning decisions | These are not blockers for the current cycle and should not delay measurement. | Decide whether to add relation-graph structured submit, deterministic relation pair hints, optional `synthesis-global.yaml`, or tighter issue-stance supplemental reads. | design note or scoped implementation plan |

## Stop Conditions

- Stop and redesign if a benchmark or semantic fixture shows material issue
  recall loss, false materiality increase, grounding loss, or artifact truth
  ambiguity.
- Stop and fix before proceeding if completed status/result can trust mutable
  terminal artifacts without `ReviewRecord` digest agreement.
- Do not add backward compatibility aliases or legacy artifact fallbacks. The
  active path should fail loud.

## Current Review Result

The latest subagent review after `ReviewRecord` terminal digest hardening found
no material issues. The only low/info follow-up was additional
`halted_partial` digest/null test coverage, captured as order 4 above.

## Progress

- Order 1 completed on 2026-06-07: the active tuning plan, synthesis
  map-reduce design, and implementation map now point to this remaining work
  order.
- Order 2 completed on 2026-06-07 for the live MCP/OAuth path:
  `npm run test:e2e` completed the full review/status/result path, prepared and
  continued a core-axis review, and exercised cancellation. The harness strips
  `ONTO_LLM_MOCK`, asserts the OAuth Codex route, rejects forbidden round1
  markdown/raw output artifacts, and now checks `max_concurrent_lenses` plus
  `observed_dispatch_width` against `.onto/settings.json`.
- Order 3 completed on 2026-06-07: `semantic-quality-gate` now supports
  fixture-specific target truth and exposes `scope=fixture_specific` plus
  `fixture_target_anchor`, with `retry-policy-target-v1` covering material
  recall, false materiality guard, causal/dependency preservation,
  actionability, grounding, and non-material preservation on a second target
  shape. Verification:
  `npx vitest run src/core-runtime/review/semantic-quality-gate.test.ts`.
- Order 4 completed on 2026-06-07: `ReviewRecord` validation tests now accept
  `halted_partial` records with absent synthesis/deliberation terminal refs and
  digests kept null, reject non-null terminal refs/digests when deliberation was
  not performed, and require all completed terminal digest fields. Verification:
  `npx vitest run src/core-runtime/review/review-record-validation.test.ts`.
- Order 5 completed on 2026-06-07 as live-route evidence:
  `development-records/benchmark/20260607-review-live-provider-smoke-readiness.md`
  records the OAuth-first route and live MCP E2E evidence. The latest follow-up
  also blocks `nested-workers` before dispatch because that route does not yet
  enforce sidecar structured output, read-only lens execution, or bounded
  dispatch.
- Post-provenance live verification completed on 2026-06-08 after adding
  `review.execution.artifact_generation_realization` and
  `semantic_quality_evidence` to review artifacts. `npm run test:e2e` completed
  the full review/status/result path, continuation, and cancellation. The
  canonical session
  `/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-review-mcp-live-e2e-OnRzHh/.onto/review/20260608-0d5cee46`
  recorded `execution_status=completed`, `total_duration_ms=269178`,
  `max_concurrent_lenses=3`, `observed_dispatch_width=3`, no degraded lenses,
  `deliberation_status=performed`, fixture-specific semantic quality
  `passed`, and top-level plus per-unit `artifact_generation_realization=live`
  with semantic quality `not_evaluated`.
- Order 6 decision pass completed on 2026-06-08. Recommended next tuning target
  is **relation-graph runtime-owned completion**, but implementation requires
  explicit approval because it changes a pipeline output schema. The current
  relation graph already uses the structured `submit_issue_artifact` path, so
  adding a separate relation-graph submit tool is not the primary gain. The
  higher-value move is to keep LLM ownership over relation semantics while
  moving `relation_id` minting and `singleton_findings` coverage completion to
  runtime. Deterministic relation-pair hints should be supplemental, not a
  hard filter, so the LLM can still find cross-lens shared-cause relations.
  `synthesis-global.yaml` remains deferred because the latest live E2E passed
  fixture-specific semantic quality without a global pass. Tighter issue-stance
  supplemental reads should wait until relation-graph ownership is settled.
- Relation-graph runtime-owned completion completed on 2026-06-08. The
  canonical `finding-relation-graph.yaml` shape remains stable for downstream
  consumers while the LLM submit payload is limited to accepted semantic
  relation rows. Runtime owns `relation_id` minting, singleton coverage
  completion over `causal_analysis_finding_ids`, and fail-loud rejection of
  relation endpoints outside that coverage scope.
- Tighter issue-stance supplemental reads completed on 2026-06-08. Each fresh
  `issue-stance:{lens}` worker receives the compact runtime stance projection
  plus only that lens's Round 1 output ref as supplemental read authority. Other
  lens Round 1 outputs remain represented through issue/finding/relation
  projection fields and are not opened to the stance worker. Verification:
  focused prompt-boundary tests, TypeScript check, live E2E, and a prompt scan
  of the E2E canonical session showing each of the nine stance packets had
  exactly one Round 1 allowed read ref matching its requested lens.
- Latest live verification after the two Order 6 tuning slices completed on
  2026-06-08: `npm run test:e2e` passed for canonical session
  `/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-review-mcp-live-e2e-mCClrk/.onto/review/20260608-3e880756`,
  with `execution_status=completed`, `total_duration_ms=323704`,
  `max_concurrent_lenses=3`, `observed_dispatch_width=3`, no degraded lenses,
  and fixture-specific semantic quality `passed`.
- Remaining optional tuning is deferred rather than active: deterministic
  relation-pair hints can be considered later as supplemental hints only, and
  `synthesis-global.yaml` remains unnecessary while the live fixture-specific
  semantic gate continues to pass without a global pass.
