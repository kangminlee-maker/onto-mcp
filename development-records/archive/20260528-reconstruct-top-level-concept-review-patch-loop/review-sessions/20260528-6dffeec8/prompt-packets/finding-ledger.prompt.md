# Issue-Stance Artifact Prompt

session_id: 20260528-6dffeec8
unit_id: finding-ledger
unit_kind: issue_artifact
artifact_id: finding-ledger
consumer_id: issue-artifact:finding-ledger
output_path: .onto/review/20260528-6dffeec8/finding-ledger.yaml

## Canonical Role
You are a review runtime artifact builder.
You are not an independent review lens.
You must derive the requested artifact from existing lens outputs and prior issue artifacts.

## Hard Output Contract
- Write YAML only.
- Do not use markdown fences.
- Do not include commentary before or after the YAML.
- Include `schema_version: 1`.
- Include `session_id: "20260528-6dffeec8"`.
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
- .onto/review/20260528-6dffeec8/round1/logic.md
- .onto/review/20260528-6dffeec8/round1/structure.md
- .onto/review/20260528-6dffeec8/round1/dependency.md
- .onto/review/20260528-6dffeec8/round1/semantics.md
- .onto/review/20260528-6dffeec8/round1/pragmatics.md
- .onto/review/20260528-6dffeec8/round1/evolution.md
- .onto/review/20260528-6dffeec8/round1/coverage.md
- .onto/review/20260528-6dffeec8/round1/conciseness.md
- .onto/review/20260528-6dffeec8/round1/axiology.md

## Review Target Profile
- profile: .onto/review/20260528-6dffeec8/execution-preparation/review-target-profile.yaml

## Task
Build `finding-ledger.yaml` from every Round 1 lens output.
Register every finding or issue claim that can affect the final review.
Do not cluster findings here.

## Required YAML Shape
schema_version: 1
session_id: "20260528-6dffeec8"
findings:
  - finding_id: finding-001
    lens_id: logic
    source_ref: round1/logic.md#finding-1
    target: "file or artifact"
    evidence_anchor: "stable evidence anchor"
    claim: "surface finding claim"
    proposed_action: "stated or inferred action"
    affected_purpose: "declared purpose or contract affected by this finding"
    failure_condition: "user group, environment, data condition, execution path, or boundary where trust fails"
    impact: "why this changes trust for the declared review purpose"
    evidence_refs: [round1/logic.md#finding-1]
    severity: medium
    domain_threshold_used: null
validation:
  unaddressable_findings: []
