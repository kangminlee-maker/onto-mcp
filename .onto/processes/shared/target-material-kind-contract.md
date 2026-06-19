# Target Material Kind Contract

> Status: design goal contract, partially registered in core lexicon.
> Purpose: define the cross-process goal for material-aware target handling
> across `review`, `reconstruct`, and future `evolve`.
> Note: "design goal / partially registered" describes the cross-process axis and
> `runtime_implementation_status`, not contract activeness. For the `reconstruct`
> slice specifically, `target-material-profile.yaml` and `material_profile_gate`
> are already contract-active per
> `reconstruct-contract-registry.yaml#validation_gate_catalog` / `#artifact_authorities`.

Related shared contract:

```text
.onto/processes/shared/pipeline-execution-ledger-contract.md
```

## 1. Goal Statement

Establish a material-aware runtime contract so `review`, `reconstruct`, and
future `evolve` can classify non-code targets and route them to appropriate
observation, validation, artifact, and UX contracts without collapsing material
type into domain, medium, target input kind, or semantic interpretation.

In product terms:

```text
Targets are not assumed to be code.
Runtime first classifies how the target must be read.
LLM then interprets what the target means for the declared purpose.
```

## 2. Scope Boundary

This goal includes:

- the shared `target_material_kind` axis
- review target profile schema alignment
- reconstruct source profile and source observation alignment
- material-aware unsupported/fail-loud behavior
- artifact refs that preserve the detected material kind
- user-facing presentation of material support and limitations

This goal excludes:

- automatic ontology Seed generation by runtime
- full spreadsheet, document, database, or code semantic parsing
- full `evolve` implementation
- MCP exposure before runtime contracts and conformance tests exist
- material-specific expert engines beyond the minimum adapter contract

## 3. Shared Axis

`target_material_kind` is owned by `.onto/authority/core-lexicon.yaml`.

Allowed values:

| Value | Meaning |
|---|---|
| `code` | Source code, package, service, script, test, config, schema, or implementation bundle. |
| `spreadsheet` | Workbook, sheet, CSV, accounting schedule, formula model, report, or tabular calculation artifact. |
| `document` | Prose, requirements, policy, guide, report, contract, PDF, DOCX, Markdown, or similar textual artifact. |
| `database` | Database connection, schema, migration, SQL file, warehouse model, table, view, or query artifact. |
| `mixed` | Bundle containing more than one material kind. Each member needs its own material classification; `mixed` itself is not an adapter target. |
| `unknown` | Runtime cannot classify the material safely. Adapter execution must halt or ask for clarification. |

The axis is separate from these other classifying axes. They are not peers in
ownership: the first two are lexicon-owned; the rest are review-contract-local
concepts cited here for orthogonality only, not owned by this shared contract or
the lexicon.

| Axis | Question answered | Defined in (owner) |
|---|---|---|
| `domain` | What is the target about? | core-lexicon (rank-1) |
| `medium` | Which cross-product implementation or reference frame accumulates reusable learning? | core-lexicon (rank-1) |
| `target_input_kind` | How did the target enter runtime? | `review-target-profile-contract.md` §5 (review-owned; reconstruct UX references it — promote to a shared/lexicon home only if reconstruct adopts it as a formal field) |
| `artifact_roles` | What responsibility does the artifact carry in this run? | `review-target-profile-contract.md` §5 (review-owned) |
| review context `source_kind` | Which context-source artifact is being admitted into prompt packets? | review context contracts (review-owned; reconstruct deliberately does not use it) |

## 4. Cross-Process Alignment

| Process | Required alignment |
|---|---|
| `review` | `review-target-profile.yaml` records `target_material_kind` and provides a per-material review adapter for `spreadsheet` via a **single per-ref disposition** (`computeSpreadsheetDisposition`): every honesty surface (`support_status`, `target_refs[].inspectable`, `review_goal`, prompt obligations, render notes) projects from one record. `inspectable` (the workbook was read and has renderable structure, *including plain tabular data*) drives `support_status`; the **positive** `backed_goals` subset drives `review_goal`, so `review_goal` carries only the backed obligations — a plain CSV is `supported`/`inspectable` yet backs none, and a macro/protection-only workbook backs only `access_and_protection_hygiene`. `support_status` degrades to `partial` when **any** rendered ref across the resolved∪materialized union is uninspectable (unsupported format .xls/.xlsb/.ods, unreadable/oversized/empty, or a corrupt shell), and the gate runs regardless of the resolved kind (a code target carrying a materialized uninspectable workbook also degrades). `code` stays `supported`, `document`/`database` stay `partial`, `mixed` stays `partial_composite`, and `unknown` stays `unknown` until their adapters land (precise per-kind states owned by `review-target-profile-contract.md` §6). Review `support_status` and reconstruct `runtime_implementation_status` are **independent per-process axes over the same shared inventory backing**: review `supported` does not imply the reconstruct seed pipeline is fully wired (it remains `partially_wired`). |
| `reconstruct` | Source profiles, source adapters, source observations, and directive validation must be keyed by `target_material_kind`. |
| `evolve` | Future adapters must not assume code-product inputs; adapter selection should start from `target_material_kind` as defined in `.onto/processes/evolve/material-kind-adapter-contract.md`. |

### 4.1 Mixed Support Semantics

Because `mixed` is an allowed public value, every process that exposes it must
also expose one of these support states:

| Support state | Runtime behavior |
|---|---|
| `supported_composite` | Classify every member, dispatch only member-specific supported adapters, and preserve cross-material refs as structural refs. |
| `partial_composite` | Classify every member, observe supported members, record unsupported members and downstream authority impact. |
| `unsupported` | Halt or ask for clarification before adapter dispatch with a stable unsupported reason. |
| `reserved_future` | Treat `mixed` as non-executable vocabulary and do not expose it as a runnable path. |

No process may dispatch a single generic `mixed` adapter. Semantic
cross-material interpretation belongs to the LLM after runtime observation.

## 5. Artifact Contract Additions

| Artifact | Required change |
|---|---|
| `review-target-profile.yaml` | Preserve `target_material_kind`, detection confidence, confidence basis, and unsupported-material state. |
| `target-material-profile.yaml` | New reconstruct runtime artifact for material candidates, selected material kind, selected profile snapshots, per-member selected profile ids for `mixed`, `contract_status`, `runtime_implementation_status`, and support state. |
| `source-inventory.yaml` | Preserve material-specific inventory units and scan boundaries. |
| `source-observations.yaml` | Include stable observation ids, material kind, adapter id, location, and structural data. |
| `source-observation-directive-validation.yaml` | Preserve runtime validation of LLM-selected observation refs against `source-observations.yaml`. |
| `candidate-disposition-validation.yaml` | Preserve runtime validation that every salient material-derived candidate has one allowed disposition before seed promotion. |
| `ontology-seed-validation.yaml` | Preserve runtime validation that LLM-authored seed claims cite selected runtime observations, close ids, and do not require runtime to generate ontology meaning. |
| `query-proofs-validation.yaml` | Preserve runtime validation of executable query/API proof refs when queryability is claimed. |
| `reconstruct-run-manifest.pre-handoff-validation.yaml` | Preserve selected registry, contract, source profile, validator, reference-standard, version, and migration snapshot consistency before terminal handoff. |
| `reconstruct-run-manifest.post-publication-validation.yaml` | Preserve complete manifest consistency after final output and record refs exist. |
| `reconstruct-record.yaml` | Preserve refs to material profile, inventory, observations, directives, seed, validations, handoff, manifest validation, metrics, and final disposition. |
| future `evolve-target-profile.yaml` | Preserve target refs, `target_material_kind`, support status, and boundary refs before any evolve adapter dispatch. |

Artifact names remain contract-owned. Runtime implementation must either match
these shapes or update the owning contract before code lands.

## 6. Runtime Replacement Steps

Implementation should proceed in this order. This table defines dependency
order only; it is not the authority for current material support. Current
reconstruct profile support, adapter readiness, profile versions, migration
status, and definition hashes are owned by
`.onto/processes/reconstruct/reconstruct-contract-registry.yaml#source_profile_records`
and must be copied into the runtime `target-material-profile.yaml` snapshot.

| Step | Runtime boundary replaced |
|---|---|
| Add a shared `target_material_kind` detection helper. | Target refs can be classified without semantic interpretation. |
| Extend `review-target-profile.yaml` schema and materializer. | Review target profiles can preserve material kind and unsupported state. |
| Add reconstruct source profile loader. | Reconstruct can dereference selected source-profile records from the registry. |
| Add unsupported/fail-loud behavior for `unknown` and unsupported formats. | Unsupported refs are recorded or halted before adapter dispatch. |
| Implement one minimal source adapter for a concrete material kind. | A selected concrete profile can produce structural observations without ontology meaning. |
| Define `source-observations.yaml` schema with stable observation ids. | LLM-authored artifacts can cite runtime observations by stable ids. |
| Validate directive evidence refs against observation ids. | Source-observation directives cannot cite non-existent runtime evidence. |
| Validate candidate disposition and ontology seed claims against selected observation evidence refs. | Candidate promotion and seed claims remain grounded in selected observations. |
| Assemble reconstruct artifact refs into `reconstruct-record.yaml`. | Terminal records can preserve refs to material profile, inventory, observations, validations, manifest validation, and handoff result. |
| Add a reconstruct Core API facade over bounded runtime helpers. | Host surfaces can call preparation, profile listing, directive validation, and record assembly through a stable API. |
| Add MCP schemas only after runtime contracts and tests exist. | Public tool schemas expose bounded runtime facts and artifact refs. |

Each step should replace one deterministic boundary. LLM-owned semantic
judgment remains outside the runtime replacement steps.

## 7. Validation Rules

Runtime must validate:

- `target_material_kind` is one of the allowed values
- `unknown` does not dispatch a material adapter
- `mixed` records per-member material kinds and one of the support states in
  section 4.1 before adapter dispatch
- `target-material-profile.yaml` snapshots every selected source profile from
  `source_profile_records`, including `profile_id`, `definition_ref`,
  `definition_sha256`, `contract_status`, `runtime_implementation_status`,
  `schema_version`, `profile_version`, and `migration_status`
- unsupported formats halt or degrade explicitly
- source observations do not claim ontology facts such as entity, relation,
  business rule, aggregate root, or policy meaning
- LLM-authored directives reference existing observation ids
- evidence refs preserve source location and material kind
- MCP results expose bounded facts and artifact refs, not semantic repairs

## 8. Prompt-Backed Reference Runs

Before full runtime implementation, at least one prompt-backed reference run
must produce the planned artifact shapes and an acceptance observation.
("Before full runtime implementation" here scopes `runtime_implementation_status`
and review/future-`evolve` adoption; it does not mean the `reconstruct` material
profile/gate are unbuilt — those are contract-active per the registry.)

Recommended reference targets:

| Target | Purpose |
|---|---|
| Spreadsheet reconstruct | Prove material observation without accounting-meaning inference. |
| Document reconstruct | Prove section/quote/reference observation without business-rule inference. |
| Mixed bundle review or reconstruct | Prove per-member material classification and cross-material refs. |

Reference runs must preserve invocation/binding, material profiling, evidence
refs, unsupported states, and user-facing result separation.

Historical reference-run evidence is isolated outside runtime reference context.
Current runtime authority is the artifact contract in this file plus the
review/reconstruct process contracts that consume it.

## 9. UX Output Contract — Material-Kind Delta

The full opening/progress/result run-UX skeleton is owned by each process's UX
contract (reconstruct: `reconstruct-execution-ux-contract.md` §§2-6; review: its
own status/result surfaces). To keep these same-rank contracts from drifting,
this section owns only the **material-kind delta** those surfaces must
additionally expose:

- opening: detected `target_material_kind`, planned material reading strategy, and
  unsupported/partial-support status
- progress: material detection result, observation counts by material kind, and
  unsupported/unknown/skipped material members
- result: material observations collected vs semantic claims promoted by LLM
  directives, and unsupported or out-of-scope material

The host LLM renders these from runtime facts or existing CLI/MCP status surfaces;
do not add a separate HTML implementation. The generic environment/process/model/
domain exposure and the observations-vs-claims-vs-gaps separation are defined once
in the process UX contracts and are not restated here.

## 10. Goal Completion Conditions

This design goal is implementation-ready when:

1. `target_material_kind` is present in core lexicon and process contracts.
2. Review and reconstruct contracts agree on the axis and naming boundaries.
3. `source_kind` is not overloaded for material classification.
4. Retired `fact_type` is not used for new source observations.
5. Artifact additions and validation rules are documented.
6. The prompt-backed reference-run requirement is documented.
7. Runtime replacement steps are small enough to implement and verify one by
   one.

It is implementation-complete only when the corresponding runtime schemas,
materializers, adapters, validators, tests, and MCP surfaces have been added for
the selected product slice.
