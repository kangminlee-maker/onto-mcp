# Target Material Kind Contract

> Status: design goal contract, partially registered in core lexicon.
> Purpose: define the cross-process goal for material-aware target handling
> across `review`, `reconstruct`, and future `evolve`.

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
| `mixed` | Bundle containing more than one material kind. Each member needs its own material classification. |
| `unknown` | Runtime cannot classify the material safely. Adapter execution must halt or ask for clarification. |

The axis is separate from:

| Axis | Question answered |
|---|---|
| `domain` | What is the target about? |
| `medium` | Which cross-product implementation or reference frame accumulates reusable learning? |
| `target_input_kind` | How did the target enter runtime? |
| `artifact_roles` | What responsibility does the artifact carry in this run? |
| review context `source_kind` | Which context-source artifact is being admitted into prompt packets? |

## 4. Cross-Process Alignment

| Process | Required alignment |
|---|---|
| `review` | `review-target-profile.yaml` records `target_material_kind`; review must not claim material-aware validation before per-material validators exist. |
| `reconstruct` | Source profiles, source adapters, source observations, and directive validation must be keyed by `target_material_kind`. |
| `evolve` | Future adapters must not assume code-product inputs; adapter selection should start from `target_material_kind` as defined in `.onto/processes/evolve/material-kind-adapter-contract.md`. |

## 5. Artifact Contract Additions

| Artifact | Required change |
|---|---|
| `review-target-profile.yaml` | Preserve `target_material_kind`, detection confidence, confidence basis, and unsupported-material state. |
| `target-material-profile.yaml` | New reconstruct runtime artifact for material candidates, selected material kind, selected profiles, and support state. |
| `source-inventory.yaml` | Preserve material-specific inventory units and scan boundaries. |
| `source-observations.yaml` | Include stable observation ids, material kind, adapter id, location, and structural data. |
| `source-observation-directive-validation.yaml` | Preserve runtime validation of LLM-selected observation refs against `source-observations.yaml`. |
| `seed-candidate-validation.yaml` | Preserve runtime validation that LLM-authored Seed claims cite selected runtime observations without runtime generating ontology meaning. |
| `reconstruct-record.yaml` | Preserve refs to material profile, inventory, observations, directives, metrics, and final disposition. |
| future `evolve-target-profile.yaml` | Preserve target refs, `target_material_kind`, support status, and boundary refs before any evolve adapter dispatch. |

Artifact names remain contract-owned. Runtime implementation must either match
these shapes or update the owning contract before code lands.

## 6. Runtime Replacement Steps

Implementation should proceed in this order:

| Step | Status |
|---|---|
| Add a shared `target_material_kind` detection helper. | implemented |
| Extend `review-target-profile.yaml` schema and materializer. | implemented |
| Add reconstruct source profile loader. | implemented |
| Add unsupported/fail-loud behavior for `unknown` and unsupported formats. | implemented for the current minimal adapter contract: unknown and unsupported refs are recorded and skipped without adapter dispatch |
| Implement one minimal source adapter, preferably `document` or `spreadsheet`. | implemented: minimal structural observers write source observations for concrete material refs |
| Define `source-observations.yaml` schema with stable observation ids. | implemented for preparation helper |
| Validate directive evidence refs against observation ids. | implemented for `SourceObservationDirective` |
| Validate Seed candidate claims against selected observation evidence refs. | implemented for `SeedCandidateDirective` helper |
| Assemble reconstruct artifact refs into `reconstruct-record.yaml`. | implemented as record helper |
| Add a reconstruct Core API facade over bounded runtime helpers. | implemented for preparation, profile listing, directive validation, and record assembly |
| Add MCP schemas only after runtime contracts and tests exist. | implemented for `onto.list_source_profiles`, `onto.observe_source`, and `onto.validate_reconstruct_directive`; metrics remain future |

Each step should replace one deterministic boundary. LLM-owned semantic
judgment remains outside the runtime replacement steps.

## 7. Validation Rules

Runtime must validate:

- `target_material_kind` is one of the allowed values
- `unknown` does not dispatch a material adapter
- `mixed` records per-member material kinds
- unsupported formats halt or degrade explicitly
- source observations do not claim ontology facts such as entity, relation,
  business rule, aggregate root, or policy meaning
- LLM-authored directives reference existing observation ids
- evidence refs preserve source location and material kind
- MCP results expose bounded facts and artifact refs, not semantic repairs

## 8. Prompt-Backed Reference Runs

Before full runtime implementation, at least one prompt-backed reference run
must produce the planned artifact shapes and an acceptance observation.

Recommended reference targets:

| Target | Purpose |
|---|---|
| Spreadsheet reconstruct | Prove material observation without accounting-meaning inference. |
| Document reconstruct | Prove section/quote/reference observation without business-rule inference. |
| Mixed bundle review or reconstruct | Prove per-member material classification and cross-material refs. |

Reference runs must preserve invocation/binding, material profiling, evidence
refs, unsupported states, and user-facing result separation.

Current evidence:

- `development-records/reference/20260527-target-material-kind-reference-evidence.md`
  records a spreadsheet review reference run proving the first material-aware
  review target profile step.
- `development-records/reference/20260527-reconstruct-material-kind-reference-evidence.md`
  records a spreadsheet reconstruct reference slice proving material profiling,
  source observation, LLM-authored directive evidence validation, and
  `reconstruct-record.yaml` assembly. MCP conformance now covers the initial
  reconstruct tool surface. The reference does not close user confirmation,
  metrics, revision, full reconstruct workflow, or evolve runtime integration.

## 9. UX Output Contract

Opening output should expose:

- selected environment, process, model, and domain
- requested target and detected `target_material_kind`
- planned material reading strategy
- unsupported or partial-support status
- runtime responsibilities and LLM responsibilities

Progress output should expose:

- material detection result
- inventory completion
- observation counts by material kind
- directive validation status
- unsupported, unknown, or skipped material members

Result output should separate:

- material observations collected
- semantic claims promoted by LLM directives
- evidence gaps
- unsupported or out-of-scope material
- next action candidates

The output contract should be rendered by the host LLM from runtime facts or by
existing CLI/MCP status surfaces. Do not add a separate HTML implementation just
to display this progress.

## 10. Goal Completion Conditions

This design goal is implementation-ready when:

1. `target_material_kind` is present in core lexicon and process contracts.
2. Review and reconstruct contracts agree on the axis and naming boundaries.
3. `source_kind` is not overloaded for material classification.
4. Legacy `fact_type` is not used for new source observations.
5. Artifact additions and validation rules are documented.
6. The prompt-backed reference-run requirement is documented.
7. Runtime replacement steps are small enough to implement and verify one by
   one.

It is implementation-complete only when the corresponding runtime schemas,
materializers, adapters, validators, tests, and MCP surfaces have been added for
the selected product slice.
