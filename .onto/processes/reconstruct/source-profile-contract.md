# Reconstruct Source Profile Contract

> Contract status: active.
> Runtime support status authority: `reconstruct-contract-registry.yaml#source_profile_records`.
> Purpose: define target-material observation contracts for `reconstruct`.

## 1. Canonical Seat

Source profiles live under:

```text
.onto/processes/reconstruct/source-profiles/
```

`SourceProfileDefinition` is the contract-owned source profile file. A
`SelectedSourceProfile` is the runtime-owned selection recorded after material
classification. Neither concept owns semantic interpretation.

In the integral exploration design, source profiles belong to the runtime
observation side. Reconstruct lens judgments may ask for additional
source refs through a validated source frontier, but the profile itself does not
decide which source is semantically important.

Source profiles are keyed by `target_material_kind`, the shared runtime axis
defined in `.onto/authority/core-lexicon.yaml`. They must not use `source_kind`
to mean code, spreadsheet, document, or database because review already uses
`source_kind` for context-source artifacts such as `materialized_input` and
`review_target_profile`.

The cross-process goal and validation rules for this axis are defined in
`.onto/processes/shared/target-material-kind-contract.md`.

The current profile record set is owned by
`.onto/processes/reconstruct/reconstruct-contract-registry.yaml#source_profile_records`.
That registry is the executable authority for profile ids, definition refs,
definition hashes, contract status, runtime implementation status, schema
version, profile version, and migration status. This source-profile contract
defines what a profile means; it does not independently publish current support
status.

Profile migration continuity is also registry-owned. `source_profile_records`
must record `supersedes`, `replaced_by`, `split_from`, `split_into`,
`merged_from`, and `merged_into` so old profile snapshots can be replayed,
compared, or migrated without guessing how a previous profile id maps to the
current registry.

`contract_status` means whether a profile definition or public material-kind
contract is authoritative. `runtime_implementation_status` means whether the
current runtime can execute that profile. A profile can be contract-active while
its runtime adapter is still planned or unsupported, but that status must be read
from `source_profile_records`.

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
- profile-specific unsupported cases that do not claim current runtime status
- profile-specific `candidate_subkind` and `disposition_detail` qualifiers

A source profile must not define rules that convert source structure into
ontology concepts or rules that choose the next source based on ontology
meaning. A source profile must not define or override `contract_status`,
`runtime_implementation_status`, `schema_version`, `profile_version`, or
`migration_status`; those values and source-profile migration mapping fields
belong to `source_profile_records`.

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
runtime-validated source frontier refs. It must not accept lens-judgment prose or
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
2. A `source_profile_records` entry that declares profile id, definition ref or
   explicit null-ref behavior, definition hash, contract status, runtime
   implementation status, schema version, profile version, migration status,
   and source-profile migration mapping fields.
3. Tests for target material detection, observation shape, source frontier
   validation, unsupported inputs, and directive evidence-ref validation.
4. `reconstruct-contract-registry.yaml` updates when artifact authority,
   validation gates, root candidate kinds, root dispositions, material kinds,
   source profile records, source profile definition refs, runtime
   implementation status values, or support-status migration behavior change.
5. MCP schema updates only after the runtime contract is implemented.

The source profile alone does not make a target material kind supported.

Profile-specific refinements must use qualifiers. A source profile may introduce
`candidate_subkind` or `disposition_detail` values for its material kind. It may
not introduce a new root candidate kind, root disposition, or material kind
without a contract and registry change.

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
