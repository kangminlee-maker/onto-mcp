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
- purpose-bearing evidence cues for this material kind
- purpose adequacy facet guidance for this material kind
- safe frontier-ref shapes for this material kind
- correct and incorrect observation examples
- purpose discovery and adequacy-frame examples and anti-examples
- profile-specific unsupported cases that do not claim current runtime status
- profile-specific `candidate_subkind` and `disposition_detail` qualifiers

A source profile must not define rules that convert source structure into
ontology concepts, choose the target purpose, or choose the next source based on
ontology meaning. Purpose-bearing evidence cues and purpose adequacy facet
guidance are admissible only as material-specific reading guidance: they tell
the host LLM and validators what to inspect and what closure to expect, not what
semantic conclusion to author. A source profile must not define or override
`contract_status`,
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

Purpose guidance examples:

| Target material kind | Allowed | Prohibited |
|---|---|---|
| Meeting record | define likely purpose evidence such as agenda, decisions, action items, owners, dates, and unresolved topics | force the record into a workflow or product path |
| Spreadsheet | define likely purpose evidence such as title, inputs, formulas, outputs, assumptions, and decision cells | declare financial/accounting meaning without source/domain evidence |
| Code | define likely purpose evidence such as README, public surface, route, command, API example, tests, and central model | declare the product purpose from package names alone |

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

Purpose adequacy refinements follow the same rule. A profile may add
material-kind-local evidence cues, recommended frame facets, required closure
examples, and anti-examples without changing the root `OntologySeed` schema.
However, if a refinement changes public artifact fields, required validation
behavior, root candidate kinds, material-kind values, or readiness projection,
the change must update the active contract, registry, validators, and migration
mapping together.

The first implementation should keep facet names profile-owned and
string-valued rather than freezing a global enum. A facet becomes a global enum
only after repeated real-source runs show that the same facet is stable across
multiple material kinds or public validation behavior depends on it.

When a real source exposes a useful facet that is not yet profile-defined, the
run records it as a source-backed `purpose_adequacy_frame.required_elements[]`
row plus a limitation or frontier if closure is incomplete. It must not silently
promote that facet into a permanent profile rule during the same run.

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

Implementable `target-material-profile.yaml` shape for `mixed`:

```yaml
schema_version: "1"
target_material_kind: mixed
support_state: supported_composite | partial_composite | unsupported
members:
  - member_id:
    target_ref:
    target_material_kind: code | spreadsheet | document | database | mixed | unknown
    selected_profile_id:
    selected_source_profile_snapshot_ref:
    source_profile_definition_ref:
    source_profile_definition_sha256:
    support_state: supported | partial | unsupported
    runtime_implementation_status:
    source_refs: []
    observation_policy:
    limitation_refs: []
cross_material_refs:
  - cross_material_ref_id:
    source_member_id:
    target_member_id:
    relation_kind:
    evidence_refs: []
aggregate_policy:
  readiness_rule: strictest_member | explicit_out_of_scope_exclusion
  unsupported_member_projection: blocked | limitation_backed | ask_user
```

`target-material-profile-validation.yaml` must prove every member has a selected
profile snapshot or unsupported reason, every selected snapshot matches the
registry-owned profile id, target material kind, definition ref, definition hash,
runtime implementation status, and support state, every member source ref is
queryable by the selected profile, every cross-material ref resolves to known
members, and aggregate readiness cannot hide unsupported or partial members.

### 6.1 Mixed Aggregate Closure

For `mixed` targets, per-member source profiles remain the observation
authority. A bundle-level `PurposeAdequacyFrame` may be projected only from:

- validated member frame elements;
- validated cross-material refs that connect member observations;
- explicit limitations for unsupported, partial, or intentionally out-of-scope
  members.

Every aggregate required element must cite the member source refs or
cross-material refs that justify it. Unsupported or partially supported members
must produce a limitation, frontier, or user-authority need before readiness is
projected. Runtime must not project aggregate `ready` when any purpose-critical
member is unsupported, partially observed, or unmapped to the aggregate frame.

Aggregate readiness uses the strictest material member readiness unless the
selected purpose frame explicitly marks that member out of scope and validation
proves the exclusion. This preserves artifact truth for bundles without
introducing a separate `mixed` parser.

Status/result/final-output projections must carry the same member lineage
forward for modeled mixed-purpose elements and whenever aggregate readiness is
`limited`, `not_ready`, or `blocked`. The projection must name the member id,
target ref, material kind, selected profile id, selected profile snapshot ref,
support state, runtime implementation status, member source refs,
cross-material refs, purpose element refs, validation ref, limitation refs, and
next action. A caller should not need to re-open the profile artifact or
candidate artifact to identify which member grounds the modeled element or
caused the aggregate readiness state.
