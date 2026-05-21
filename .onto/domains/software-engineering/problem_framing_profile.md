---
version: 1
last_updated: "2026-05-21"
source: issue-stance-deliberation-contract
status: design_target
doc_type: custom:problem_framing_profile
---

# Software Engineering Domain — Problem Framing Profile

This profile defines software-engineering-specific axes for review closure problem framing.
It extends the common spine in `.onto/processes/review/issue-stance-deliberation-contract.md`.

The profile does not redefine common spine values.

## Domain Axes

### implementation_surface

Required when an issue affects a concrete software artifact, runtime path, or development workflow.

| Value | Meaning |
|---|---|
| `runtime_core` | TS core/runtime behavior |
| `review_runtime` | review process, prompts, artifacts, runner |
| `mcp_surface` | MCP tool schema/server boundary |
| `api_contract` | exported API, typed facade, request/response shape |
| `build_package_boundary` | build output, package exports, CLI entrypoint, distribution path |
| `test_verification` | tests, conformance checks, smoke checks, validation harness |
| `authority_docs` | `.onto` authority/process/principle docs used by runtime or agents |
| `developer_experience` | setup, commands, diagnostics, handoff ergonomics |
| `future_work` | reconstruct, evolve, learn, govern, or later product area |

### defect_kind

Required when the issue can be expressed as a software-development problem type.

| Value | Meaning |
|---|---|
| `logic_bug` | implemented behavior is internally wrong |
| `contract_gap` | document, schema, or artifact seat is insufficient for deterministic implementation |
| `stale_authority_text` | active authority wording diverges from current runtime or product direction |
| `boundary_mismatch` | ownership, package, API, or runtime boundary is ambiguous or inconsistent |
| `integration_failure` | independently valid parts do not compose into the intended path |
| `verification_gap` | implementation or contract lacks a reliable check |
| `observability_gap` | failure or state cannot be inspected well enough to operate or debug |
| `quality_debt` | issue increases maintenance, drift, or coordination cost without immediate breakage |
| `implementation_task` | design is sufficiently closed and can move to build work |

### verification_need

Optional. Use when the next useful evidence path matters to closure.

| Value | Meaning |
|---|---|
| `schema_validation` | parser or schema check should validate the artifact shape |
| `unit_test` | focused behavior test should cover the issue |
| `integration_smoke` | end-to-end or cross-module smoke check is needed |
| `package_install_smoke` | packaged install or executable path must be verified |
| `provider_conformance` | provider-specific behavior needs a conformance check |
| `human_design_decision` | maintainer/user decision is the next verification gate |

## Rules

1. `implementation_surface` and `defect_kind` may be omitted only when the issue is outside software-development substance.
2. `stale_authority_text` must be paired with `implementation_surface` or an explicit rationale explaining that runtime behavior is unaffected.
3. `implementation_task` is not a fix proposal; it means the issue is framed well enough to become implementation input.
4. `future_work` should be used when an issue belongs to reconstruct, evolve, learn, govern, or another planned capability rather than the current review path.
