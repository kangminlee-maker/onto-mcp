# Target Material Kind Reference Evidence

> Date: 2026-05-27
> Scope: material-aware review target profile evidence for the shared
> `target_material_kind` goal.

## Reference Target

Fixture:

```text
development-records/reference/material-kind/accounting-schedule.csv
```

Purpose:

```text
Reference-check material-aware review target profile for a spreadsheet target.
```

## Reference Run

Command:

```bash
npm run review:invoke -- development-records/reference/material-kind/accounting-schedule.csv "Reference-check material-aware review target profile for a spreadsheet target." --executor-realization mock --review-mode core-axis --no-watch
```

Session:

```text
.onto/review/20260527-f8cd002f
```

The session path is runtime-ephemeral and ignored by git. This record preserves
the material-profile evidence needed by the design goal.

## Material Profile Evidence

Artifact:

```text
.onto/review/20260527-f8cd002f/execution-preparation/review-target-profile.yaml
```

Observed fields:

```yaml
target_input_kind: single_file
target_material_kind: spreadsheet
artifact_roles:
  primary: data_artifact
domain: none
material_profile:
  target_material_kind: spreadsheet
  target_material_kind_candidates:
    - spreadsheet
  support_status: partial
  unsupported_reason: review records target material kind, but material-specific
    validation is not implemented yet
  detection:
    owner: runtime_heuristic
    confidence: 0.92
    confidence_basis: file extension indicates spreadsheet material
```

## Acceptance Observation

- Runtime classified the CSV target as `target_material_kind=spreadsheet`.
- Runtime did not claim accounting meaning, table semantics, business rules, or
  ontology facts from the spreadsheet fixture.
- Review profile preserved the difference between `target_input_kind`
  (`single_file`), `target_material_kind` (`spreadsheet`), and `artifact_roles`
  (`data_artifact`).
- `support_status=partial` correctly says material-specific validation is not
  implemented yet.

## Limitation

The reconstruct companion reference is recorded in
`development-records/reference/20260527-reconstruct-material-kind-reference-evidence.md`.
Together, the two reference records cover the active review target profile slice
and the first reconstruct preparation/directive-validation/record-assembly
slice. They do not close future MCP reconstruct tooling, user confirmation,
metrics, revision, or evolve runtime integration.
