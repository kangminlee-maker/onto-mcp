## Pragmatics Lens Result

No material pragmatics issue found within the declared boundary.

The current diff makes the Seed's practical question/action surface materially more answerable and less ambiguous. The added `answerability_scope` gives users a declared handoff-question inventory, partitions each question into exactly one supported/deferred/unsupported bucket, and defines `supported_actions[].supported_by_question_ids[]` as the sole canonical question-to-action support edge. This is enough for a principal user or later ontology author to ask: "What can this Seed answer?", "What is deferred?", "What action is supported by which question?", and "What should not be treated as ready?"

The lifecycle and authority changes also preserve practical traceability for the review's highlighted concerns. Concept/relation transitions are routed through `concept_identity_events` and `relation_identity_events`; demotion is bridged only through `concept_identity_events[].target_detail_ids` to `lower_level_detail_placements[].detail_id`; `detail_placement_events` do not carry prior concept lineage; current source snapshots live in `lifecycle.source_snapshot_refs` while transition prior refs stay under `source_snapshot_transition.prior_snapshot_refs`; pressure lifecycle uses one `pressure_id`; relation axis is derived from `relation_kind`; and migration compatibility has an explicit `migration_artifact_ref` path when details are externalized.

From the pragmatics perspective, the design now gives a user a bounded and practical route to answer the relevant Seed-stage questions without needing to infer alternate authority seats or reconcile competing lifecycle fields.

## Findings

None.

## Evidence Checked

- `.onto/review/20260528-4080a34b/execution-preparation/materialized-input.md`
  - Seed answerability contract and validation rules
  - lifecycle schema and transition authority
  - relation graph authority
  - lower-level detail placement and demotion bridge
  - frontier pressure and convergence rules
  - validation expectations
  - README and `IMPLEMENTATION_MAP.html` authority summaries
- `.onto/roles/pragmatics.md`
- `.onto/review/20260528-4080a34b/interpretation.yaml`
- `.onto/review/20260528-4080a34b/binding.yaml`
- `.onto/review/20260528-4080a34b/execution-preparation/review-target-profile.yaml`
- `.onto/review/20260528-4080a34b/execution-preparation/review-context-manifest.yaml`
- `.onto/domains/software-engineering/competency_qs.md`
- `.onto/domains/software-engineering/prompt_interface.md`

## Boundary Limitations

Web research was denied by the prompt packet, so no web sources were used. I did not read other Round 1 lens outputs and did not recursively follow references beyond the files allowed or explicitly relevant to this lens unit.

### Domain Constraints Used

- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "version: 8; source_sha256: ad69bd914792e361584d5c39a3bf179567ec63ce6519da77da025f4584194565"
  anchor: "Applicability verdict protocol; CQ-A-01; CQ-A-02; CQ-A-08; CQ-A-11; CQ-A-12; CQ-A-14"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version: 4; source_sha256: 8b201dc3fb2be67d1eb7d22ba85f4476000c137ece501d5712bb261f07740f97"
  anchor: "Ownership Boundary Structure; Response Format Constraints; Output Sink Constraints; External Content Handling; Fail-Loud Interface Rule"

### Domain Context Assumptions

[]