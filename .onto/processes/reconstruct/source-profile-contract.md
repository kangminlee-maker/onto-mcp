# Reconstruct Source Profile Contract

> Status: design contract, partially wired runtime.
> Purpose: define target-material observation contracts for `reconstruct`.

## 1. Canonical Seat

Source profiles live under:

```text
.onto/processes/reconstruct/source-profiles/
```

The historical `explorers/` folder is archived and must not be revived as an
active runtime path. `SourceProfile` is the current name because the file guides
runtime observation. It is not an autonomous semantic explorer.

In the integral exploration design, source profiles still belong to the runtime
observation side. Reconstruct lenses may ask for additional source refs through
a validated source frontier, but the profile itself does not decide which source
is semantically important.

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
| `mixed` | no standalone parser profile; requires per-member profiles or explicit unsupported/halt behavior |
| `unknown` | no profile; runtime must halt or ask for clarification |

## 2. Profile Responsibility

A source profile may define:

- target material identification hints
- module inventory unit
- structural recognition scope
- detail location notation
- context questions
- scan targets
- safe frontier-ref shapes for this material kind
- correct and incorrect observation examples
- current support status and explicit unsupported cases

A source profile must not define rules that convert source structure into
ontology concepts or rules that choose the next source based on ontology
meaning.

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

When a source adapter is invoked after the first round, it consumes only
runtime-validated source frontier refs. It must not accept lens prose or
semantic labels as source locations.

The future adapter contract must fail explicitly when:

- the target material kind cannot be resolved
- the source format is unsupported
- the target is outside the declared filesystem or connection boundary
- a requested source frontier ref is not a concrete source location for this
  material kind
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
| `mixed` | Inventory each member with its own material kind and preserve cross-material refs without collapsing them into one parser. If a composite profile is not implemented, halt or ask before adapter dispatch. |
| `unknown` | Halt or ask for clarification; do not guess an adapter. |

Domain interpretation happens after observation. For example, an accounting
spreadsheet is `target_material_kind=spreadsheet` and may use `domain=accounting`;
the spreadsheet adapter reports cells and formulas, while the LLM interprets
accounting meaning from evidence and selected domain documents. If that
interpretation shows that another sheet, range, document section, table, or code
file is needed, the host LLM writes a source frontier directive and runtime
validates it before any additional observation occurs.

## 5. Extension Rule

Adding a new target material kind requires:

1. A new source profile under `.onto/processes/reconstruct/source-profiles/`.
2. Runtime adapter support or an explicit unsupported status.
3. Tests for target material detection, observation shape, source frontier
   validation, unsupported inputs, and directive evidence-ref validation.
4. MCP schema updates only after the runtime contract is implemented.

The source profile alone does not make a target material kind supported.

## 6. Mixed Material Rule

`mixed` is a public `TargetMaterialKind` value, but it is not a material parser.
Runtime must choose one of these behaviors before observation:

| Behavior | Requirement |
|---|---|
| supported composite | Runtime writes per-member material classification, dispatches only supported member profiles, and preserves cross-material refs in inventory and observations. |
| partial composite | Runtime observes supported members, records unsupported members separately, and exposes the downstream authority limit. |
| unsupported | Runtime halts or asks for clarification with a stable unsupported reason before adapter dispatch. |

No source profile may treat `mixed` as a shortcut for reading a bundle with one
adapter. Cross-material semantic meaning remains LLM-owned and must be grounded
in per-member observations plus validated cross-material refs.
