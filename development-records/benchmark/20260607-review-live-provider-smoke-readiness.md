---
as_of: 2026-06-08
status: completed_live_mcp_e2e
purpose: live provider smoke evidence after review pipeline optimization
canonical_session_root: /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-review-mcp-live-e2e-OnRzHh/.onto/review/20260608-0d5cee46
continued_session_root: /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-review-mcp-live-e2e-OnRzHh/.onto/review/20260608-bca888da
cancelled_session_root: /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-review-mcp-live-e2e-OnRzHh/.onto/review/20260608-b86a560c
---

# Review Live Provider Smoke Readiness

## Current Route

The live review path uses the OAuth-first Codex worker route:

- `review.artifacts.lens_output_format=sidecar`
- `review.artifacts.write_lens_markdown=false`
- `review.execution.topology=main-workers`
- `review.execution.max_concurrent_lenses=3`
- actors: `auth=oauth`, `provider=openai`, `model=gpt-5.5`, `effort=medium`
- route: `external_oauth_worker`, adapter `codex_cli`

API-key and local routes remain supported configuration options, but they are
not the default route for this repository.

## Smoke Command

```bash
npm run test:e2e
```

The command starts the MCP server, runs `onto_review`, polls
`onto_review_status`, reads `onto_review_result`, prepares and continues a
second review through `onto_review_continue`, then verifies cancellation through
`onto_review_cancel`.

## Result

The latest completed live run before this note:

- Full 9-lens review completed.
- `total_duration_ms=269178`
- `max_concurrent_lenses=3`
- `observed_dispatch_width=3`
- degraded lenses: none
- `deliberation_status=performed`
- artifact generation realization: `live`
- semantic quality evidence in artifacts: `not_evaluated`
- top-level and per-unit execution provenance is present in
  `execution-result.yaml` and `review-run-manifest.yaml`
- semantic quality gate: passed for fixture
  `review-pipeline-target-v1`

The continuation scenario completed a core-axis review. A follow-up fix now
persists `execution-plan.max_concurrent_lenses` and asserts the continued run
keeps the same settings-derived dispatch width.

## Verification Scope

`semantic_quality_gate` is fixture-specific. A pass means the bundled live E2E
target preserved material issue recall, false-materiality guard, causal shape,
actionability, grounding, and non-material preservation for the selected
fixture. It is not a blanket quality proof for every possible target.
