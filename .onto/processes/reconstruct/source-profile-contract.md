# Reconstruct Source Profile Contract

> Status: design contract, not wired runtime.
> Purpose: define target-material observation contracts for `reconstruct`.

## 1. Canonical Seat

Source profiles live under:

```text
.onto/processes/reconstruct/source-profiles/
```

The historical `explorers/` folder is archived and must not be revived as an
active runtime path. `SourceProfile` is the current name because the file guides
runtime observation. It is not an autonomous semantic explorer.

Source profiles are keyed by `target_material_kind`, the shared runtime axis
defined in `.onto/authority/core-lexicon.yaml`. They must not use `source_kind`
to mean code, spreadsheet, document, or database because review already uses
`source_kind` for context-source artifacts such as `materialized_input` and
`review_target_profile`.

The cross-process goal and validation rules for this axis are defined in
`.onto/processes/shared/target-material-kind-contract.md`.

Current source profiles:

| Target material kind | Profile |
|---|---|
| `code` | `.onto/processes/reconstruct/source-profiles/code.md` |
| `spreadsheet` | `.onto/processes/reconstruct/source-profiles/spreadsheet.md` |
| `database` | `.onto/processes/reconstruct/source-profiles/database.md` |
| `document` | `.onto/processes/reconstruct/source-profiles/document.md` |

## 2. Profile Responsibility

A source profile may define:

- target material identification hints
- module inventory unit
- structural recognition scope
- detail location notation
- context questions
- scan targets
- correct and incorrect observation examples
- current support status and explicit unsupported cases

A source profile must not define rules that convert source structure into
ontology concepts.

Examples:

| Source observation | Allowed | Prohibited |
|---|---|---|
| Spreadsheet merged range with bold text | report the formatting and cells | declare it a table header or business entity |
| Code class with status fields | report fields, branches, and locations | declare aggregate root or domain service role |
| Database table with missing FK | report schema shape and constraint absence | declare business relation meaning |
| Document section with a policy sentence | report section, quote, and reference | declare the core business rule |

## 3. Runtime Adapter Boundary

Source adapters are planned runtime components. They consume source profiles and
return observations, but they do not interpret ontology meaning. The source
profile may guide observation scope, but the adapter schema is the runtime
contract that fixes returned fields and observation ids.

The future adapter contract must fail explicitly when:

- the target material kind cannot be resolved
- the source format is unsupported
- the target is outside the declared filesystem or connection boundary
- an observation ref cited by a directive does not exist
- required parser/tool support is unavailable

Adapters must return stable observation ids so LLM-authored directives can cite
evidence without copying large source fragments into every artifact.

## 4. Material-Aware Processing Rule

Every profile must make the material-specific reading strategy visible:

| Target material kind | Reading strategy |
|---|---|
| `code` | Parse files, symbols, imports, tests, schemas, and configuration without assigning domain roles. |
| `spreadsheet` | Inspect workbook/sheet/range/formula/formatting structure without declaring accounting or business meaning. |
| `document` | Inspect sections, headings, quotes, tables, references, and definitions without choosing canonical business rules. |
| `database` | Inspect schemas, tables, columns, constraints, indexes, and queries without assigning business relation meaning. |
| `mixed` | Inventory each member with its own material kind and preserve cross-material refs without collapsing them into one parser. |
| `unknown` | Halt or ask for clarification; do not guess an adapter. |

Domain interpretation happens after observation. For example, an accounting
spreadsheet is `target_material_kind=spreadsheet` and may use `domain=accounting`;
the spreadsheet adapter reports cells and formulas, while the LLM interprets
accounting meaning from evidence and selected domain documents.

## 5. Extension Rule

Adding a new target material kind requires:

1. A new source profile under `.onto/processes/reconstruct/source-profiles/`.
2. Runtime adapter support or an explicit unsupported status.
3. Tests for target material detection, observation shape, unsupported inputs,
   and directive evidence-ref validation.
4. MCP schema updates only after the runtime contract is implemented.

The source profile alone does not make a target material kind supported.
