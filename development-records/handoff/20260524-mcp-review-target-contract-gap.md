# MCP Review Target Contract Gap Handoff

> Status: Handoff
> Date: 2026-05-24
> Context: implementation review dogfooding with `domain=software-engineering`

## Summary

During an actual MCP `onto.review` run for the current implementation, the MCP
tool accepted only a single `target` string. The reviewed implementation was a
multi-file working-tree change, so the session used an ignored review packet
file under `.onto/review/manual-targets/` as a temporary workaround.

This workaround is acceptable for dogfooding, but it is not the desired product
contract. Implementation review is rarely a single file. The MCP review target
contract needs first-class multi-artifact target support.

## Decision To Carry Forward

Add a next design/implementation task for MCP review target modeling.

The target contract should support at least:

- single file target
- directory target
- explicit bundle target with primary ref and member refs
- git diff / working-tree scope target
- generated review packet target with clear provenance when used

The tool surface should preserve:

- target boundary and allowed filesystem roots
- primary artifact versus supporting artifacts
- stable refs and hashes for materialized inputs
- whether the target was user-supplied directly or generated as a review packet
- fail-loud rejection for ambiguous, external, or unowned target scopes

## Current Workaround Used

The run created:

- `.onto/review/manual-targets/20260524-software-engineering-implementation-review-input.md`

Then invoked MCP:

- tool: `onto.review`
- domain: `software-engineering`
- reviewMode: `full`
- deliberation: `controlled_lens_deliberation`
- target: the generated packet file

Review result session:

- `.onto/review/20260524-fcd93fc4`

## Risk If Not Fixed

If this remains as-is, users and host agents will keep inventing ad hoc packet
formats for multi-file reviews. That creates contract drift, weak provenance,
and unclear review boundaries. It also hides whether the MCP server reviewed the
actual target or a generated representation of it.

## Recommended Next Step

Design `ReviewTargetInput` for MCP and core API, then wire it through:

1. MCP schema
2. core API request type
3. invocation interpretation
4. invocation binding
5. execution-preparation materialized input
6. review context manifest refs/hashes
7. status/result artifact disclosure
8. conformance and e2e tests

