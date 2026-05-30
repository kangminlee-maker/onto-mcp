# Issue-Stance Artifact Prompt

session_id: 20260528-da9e31db
unit_id: issue-stance-matrix
unit_kind: issue_artifact
artifact_id: issue-stance-matrix
consumer_id: issue-artifact:issue-stance-matrix
output_path: .onto/review/20260528-da9e31db/issue-stance-matrix.yaml

## Canonical Role
You are a review runtime artifact builder.
You are not an independent review lens.
You must derive the requested artifact from existing lens outputs and prior issue artifacts.

## Hard Output Contract
- Write YAML only.
- Do not use markdown fences.
- Do not include commentary before or after the YAML.
- Include `schema_version: 1`.
- Include `session_id: "20260528-da9e31db"`.
- Quote every scalar string value with double quotes, or use a YAML block scalar for long text.
- Do not leave a colon-bearing text value unquoted.
- Preserve lens IDs, source refs, issue IDs, and finding IDs consistently.
- If evidence is insufficient, encode that explicitly in the YAML instead of inventing facts.
- Enum fields must use exactly one listed token. Do not append explanation text to enum values; put explanations in rationale fields.

## Severity Contract
`severity` is the review result classification axis. It also determines whether an issue is material.

Allowed severity values:
- blocker: the declared primary happy path cannot be achieved by any intended user, or the result appears trustworthy while breaking a core contract.
- high: a supported user group, environment, data condition, or execution path cannot achieve the declared purpose.
- medium: the happy path is possible, but trust, auditability, reproducibility, completeness, or decision quality is meaningfully weakened.
- low: an improvement opportunity that does not make the reviewed result unsafe for its declared purpose.
- info: an observation, question, or evidence gap that is not yet an issue.

Derived materiality:
- material issue: blocker, high, medium
- non-material finding: low, info

Every blocker/high/medium severity claim must cite concrete evidence and explain affected_purpose, failure_condition, and impact.
If evidence is insufficient, use severity: info and explain the evidence gap.

## Lens Outputs
- .onto/review/20260528-da9e31db/round1/logic.md
- .onto/review/20260528-da9e31db/round1/structure.md
- .onto/review/20260528-da9e31db/round1/dependency.md
- .onto/review/20260528-da9e31db/round1/semantics.md
- .onto/review/20260528-da9e31db/round1/pragmatics.md
- .onto/review/20260528-da9e31db/round1/evolution.md
- .onto/review/20260528-da9e31db/round1/coverage.md
- .onto/review/20260528-da9e31db/round1/conciseness.md
- .onto/review/20260528-da9e31db/round1/axiology.md

## Review Target Profile
- profile: .onto/review/20260528-da9e31db/execution-preparation/review-target-profile.yaml

## Prior Issue Artifacts
- finding-ledger: .onto/review/20260528-da9e31db/finding-ledger.yaml
- finding-relation-graph: .onto/review/20260528-da9e31db/finding-relation-graph.yaml
- issue-ledger: .onto/review/20260528-da9e31db/issue-ledger.yaml

## Task
Build `issue-stance-matrix.yaml`.
Every participating lens must have one stance for every issue.

Allowed stance values:
- support
- oppose
- narrow
- alternative_root
- surface_only
- not_applicable
- insufficient_evidence

Allowed root_hypothesis_position values:
- accepts
- narrows
- replaces
- rejects
- not_applicable
- insufficient_evidence

Allowed severity_position values:
- keeps
- raises
- lowers
- not_applicable
- insufficient_evidence

## Required YAML Shape
schema_version: 1
session_id: "20260528-da9e31db"
issues:
  - issue_id: issue-001
    stances:
      - lens_id: logic
        stance: support
        rationale: "why this lens takes this stance"
        root_hypothesis_position: accepts
        severity_position: keeps
        evidence_refs: [round1/logic.md]
validation:
  missing_stances: []
