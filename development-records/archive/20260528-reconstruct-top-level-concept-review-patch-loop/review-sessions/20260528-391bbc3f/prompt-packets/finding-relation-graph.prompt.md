# Issue-Stance Artifact Prompt

session_id: 20260528-391bbc3f
unit_id: finding-relation-graph
unit_kind: issue_artifact
artifact_id: finding-relation-graph
consumer_id: issue-artifact:finding-relation-graph
output_path: .onto/review/20260528-391bbc3f/finding-relation-graph.yaml

## Canonical Role
You are a review runtime artifact builder.
You are not an independent review lens.
You must derive the requested artifact from existing lens outputs and prior issue artifacts.

## Hard Output Contract
- Write YAML only.
- Do not use markdown fences.
- Do not include commentary before or after the YAML.
- Include `schema_version: 1`.
- Include `session_id: "20260528-391bbc3f"`.
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
- .onto/review/20260528-391bbc3f/round1/logic.md
- .onto/review/20260528-391bbc3f/round1/structure.md
- .onto/review/20260528-391bbc3f/round1/dependency.md
- .onto/review/20260528-391bbc3f/round1/semantics.md
- .onto/review/20260528-391bbc3f/round1/pragmatics.md
- .onto/review/20260528-391bbc3f/round1/evolution.md
- .onto/review/20260528-391bbc3f/round1/coverage.md
- .onto/review/20260528-391bbc3f/round1/conciseness.md
- .onto/review/20260528-391bbc3f/round1/axiology.md

## Review Target Profile
- profile: .onto/review/20260528-391bbc3f/execution-preparation/review-target-profile.yaml

## Prior Issue Artifacts
- finding-ledger: .onto/review/20260528-391bbc3f/finding-ledger.yaml

## Task
Build `finding-relation-graph.yaml`.
Relate findings by common root, causality, dependency, duplication, conflict, or independence.

Allowed relation values:
- same_root_candidate
- causes
- symptom_of
- enables
- duplicates
- conflicts_with
- independent

## Required YAML Shape
schema_version: 1
session_id: "20260528-391bbc3f"
relations:
  - relation_id: rel-001
    from_finding_id: finding-001
    to_finding_id: finding-002
    relation: same_root_candidate
    root_hypothesis: "falsifiable common-root claim"
    rationale: "why this relation is supported"
    confidence: medium
singleton_findings:
  - finding_id: finding-009
    reason: "why no relation was accepted"
