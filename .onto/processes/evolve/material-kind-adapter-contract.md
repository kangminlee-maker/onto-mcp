# Evolve Material Kind Adapter Contract

> Status: future design contract, no active runtime.
> Purpose: keep future `evolve` target handling aligned with the shared
> `target_material_kind` axis before any evolve MCP tool or runtime adapter is
> reintroduced.

## 1. Position

`evolve` is a brownfield design process: the target already exists, and the
user wants a new area or change to coexist with that current target.

The retired evolve process explicitly treated the target as material-neutral:
the target may be code, a spreadsheet, a document, or another existing design
artifact. In the current productized repo, that neutrality must be implemented
through the shared `target_material_kind` axis rather than through a
code-product default adapter.

The shared material contract is:

```text
.onto/processes/shared/target-material-kind-contract.md
```

No `evolve` runtime or MCP tool is active in this repository. This document is
the alignment contract for the future runtime slice.

## 2. Required Prelude

Future `evolve` execution must start with the same material-aware boundary used
by review and reconstruct:

1. Host LLM interprets the user request into target candidates, intended
   outcome, and ambiguity.
2. Runtime binds target refs and filesystem or connection boundaries.
3. Runtime classifies each target with `target_material_kind`.
4. Runtime selects an evolve adapter only after material classification.
5. Runtime records unsupported, mixed, or unknown material states explicitly.

Adapter dispatch must not happen before step 3.

## 3. Adapter Boundary

Future evolve adapters may observe or project target structure, but they must
not perform the design inquiry or choose the user's change direction.

Runtime may own:

- target material profiling
- material-specific observation or projection
- adapter support status
- source and artifact refs
- deterministic metrics and validation reports
- unsupported or unknown material failure records

Host LLM and user-mediated flow own:

- outcome clarification
- area discovery
- current-state explanation in user terms
- target-state options
- constraint classification
- final specification content
- continue, revise, or stop judgment

## 4. Material Dispatch Rules

| `target_material_kind` | Future evolve adapter behavior |
|---|---|
| `code` | May use a code-product adapter only for code/config/package structure. |
| `spreadsheet` | Must use a spreadsheet-aware adapter or halt with unsupported status. |
| `document` | Must use a document-aware adapter or halt with unsupported status. |
| `database` | Must use a database-aware adapter or halt with unsupported status. |
| `mixed` | Must split or enumerate per-member material kinds before adapter dispatch. |
| `unknown` | Must halt or ask for clarification; do not guess an adapter. |

The code adapter is not the fallback for non-code material.

## 5. Future Artifact Alignment

Future evolve artifacts should preserve material classification before any
design-stage output:

| Artifact | Owner | Purpose |
|---|---|---|
| `evolve-target-profile.yaml` | runtime | target refs, `target_material_kind`, candidates, support status, and boundary refs |
| `evolve-adapter-selection.yaml` | runtime | selected adapter id, material kind, support status, and unsupported reason |
| `evolve-context-observations.yaml` | runtime | material-specific current-state observations without design recommendations |
| `evolve-specification.yaml` | host LLM, user confirmed | proposed design change after inquiry and scope agreement |
| `evolve-record.yaml` | runtime assembly | artifact refs, material status, validation summaries, and final disposition refs |

These names are future contract placeholders. Runtime implementation must either
match this contract or update this contract before code lands.

## 6. Non-Goals

- No active `evolve` MCP tool is introduced by this contract.
- No code, spreadsheet, document, or database expert engine is implied.
- No runtime-generated design specification is allowed.
- No legacy `src/core-runtime/evolve` path should be revived as-is.
- No `source_kind` or legacy `fact_type` value should be reused for target
  material classification.

## 7. Verification Target

When future evolve implementation starts, the first tests should prove:

- non-code targets are not routed to a code adapter
- `unknown` does not dispatch an adapter
- `mixed` preserves per-member material kinds
- unsupported material states produce explicit structured output
- generated artifacts preserve `target_material_kind`
- runtime outputs bounded observations and refs, not design decisions
