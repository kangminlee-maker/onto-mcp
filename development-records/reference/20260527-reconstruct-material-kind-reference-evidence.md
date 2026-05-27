# Reconstruct Material Kind Reference Evidence

> Date: 2026-05-27
> Scope: prompt-backed reconstruct reference evidence for the shared
> `target_material_kind` goal.

## Reference Target

Fixture:

```text
development-records/reference/material-kind/accounting-schedule.csv
```

Reference artifact session:

```text
development-records/reference/material-kind/reconstruct-spreadsheet-session/
```

## Reference Path

This reference path uses the current TS runtime helpers for deterministic
boundaries and LLM-authored fixture directives for semantic claims:

1. Runtime materialized `target-material-profile.yaml`.
2. Runtime materialized `source-inventory.yaml`.
3. Runtime materialized `source-observations.yaml`.
4. LLM-authored fixture wrote `source-observation-directive.yaml`.
5. Runtime wrote `source-observation-directive-validation.yaml`.
6. LLM-authored fixture wrote `seed-candidate.yaml`.
7. Runtime wrote `seed-candidate-validation.yaml`.
8. Runtime assembled `reconstruct-record.yaml`.

The LLM-authored fixture is intentionally small. It does not claim accounting
correctness; it only proves that semantic claims can be evidence-linked to
runtime observations without the runtime generating ontology meaning.

## Artifact Evidence

Primary record:

```text
development-records/reference/material-kind/reconstruct-spreadsheet-session/reconstruct-record.yaml
```

Observed fields:

```yaml
entrypoint: reconstruct
record_stage: seed_candidate_validated
target_material_kind: spreadsheet
support_status: partial
validation_summary:
  source_observation_directive_status: valid
  seed_candidate_status: valid
  semantic_claim_count: 4
  evidence_ref_count: 4
runtime_boundary:
  semantic_generation: not_performed
warnings: []
```

Source observation evidence:

```yaml
observation_id: obs_spreadsheet_b4d5d4be8d0151ec
target_material_kind: spreadsheet
adapter_id: minimal-spreadsheet-structure-observer
summary: spreadsheet material observed at accounting-schedule.csv
structural_data:
  basename: accounting-schedule.csv
  extension: .csv
  path_kind: file
  line_count: 4
```

Seed validation evidence:

```yaml
validation_status: valid
validation_results:
  - seed_candidate_evidence_valid
violations: []
```

## Acceptance Observation

- Runtime classified the CSV target as `target_material_kind=spreadsheet`.
- Runtime produced only structural source observations and did not infer
  accounting entities, accounting rules, or business meaning.
- LLM-authored Seed candidate claims were accepted only because each claim cited
  a selected runtime observation with matching material kind, source ref, and
  location.
- `reconstruct-record.yaml` preserves artifact refs and validation summaries
  without becoming a second ontology truth source.

## Remaining Gap

This reference evidence proves the material-aware reconstruct preparation,
directive validation, and record assembly slice. MCP conformance separately
proves the initial reconstruct tool surface for source profile listing, source
observation, and directive validation. This reference does not close user
confirmation flow, competency-question metrics, revision cycle, full reconstruct
workflow, or final evolve integration.
