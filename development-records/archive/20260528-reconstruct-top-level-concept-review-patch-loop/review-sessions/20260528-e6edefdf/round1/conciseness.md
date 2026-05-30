# Conciseness Lens Review

## Verdict

Material conciseness issue remains.

The patch mostly consolidates prior ambiguity into clear authority seats, but lifecycle identity mapping still keeps two practical paths for the same concept/relation transition relationships.

## Findings

### C1. Lifecycle mapping authority is duplicated between mapping arrays and identity event arrays

`lifecycle.prior_concept_mappings[]` and `lifecycle.concept_identity_events[]` both encode prior/current concept transitions. The same pattern appears for relations through `prior_relation_mappings[]` and `relation_identity_events[]`.

This is especially visible where the contract says:

- `prior_concept_mappings[].prior_concept_ids[]`
- `prior_concept_mappings[].current_concept_ids[]`
- `prior_concept_mappings[].current_detail_ids[]`
- `concept_identity_events[].prior_concept_ids[]`
- `concept_identity_events[].current_concept_ids[]`
- `concept_identity_events[].target_detail_ids[]`

The prose attempts to distinguish mappings as cross-Seed projections and identity events as event/provenance logs, but then also says split/merged lifecycle event array fields are the authority and that mappings must be derivable from identity events or share enough IDs. That leaves two relationship paths for the same transition: the mapping array and the event array.

Why this matters under conciseness: the software conciseness rule treats multiple-path expression of the same relationship as a must-remove pattern when both paths carry the same meaning. Here, the prior-to-current concept/relation edge can be read from either the mapping array or the event array, and demotion can be read through either `current_detail_ids` or `target_detail_ids`.

How to fix: make `prior_concept_mappings[]` and `prior_relation_mappings[]` the sole canonical transition mapping authority. Keep identity events as provenance only by either:

- removing prior/current mapping arrays from identity events and replacing them with refs to mapping records, or
- explicitly declaring identity event prior/current arrays as non-authoritative provenance echoes that must be generated from mapping records and cannot be independently authored.

For demotion, prefer one canonical bridge from prior concept IDs to lower-level detail IDs, likely `prior_concept_mappings[].current_detail_ids[]`; make `concept_identity_events[].target_detail_ids[]` derived or remove it.

## Non-Issues Checked

Answerability status buckets are not redundant in the material sense. `declared_handoff_questions[]` owns the closed inventory and question text/source, while `supported_questions[]`, `deferred_questions[]`, and `unsupported_questions[]` encode mutually exclusive status-specific payloads. The contract also removes the separate `question_status` field, so this is compact enough.

`supported_actions[].supported_by_question_ids[]` is correctly presented as the sole canonical question-to-action support edge; I did not find a reverse action-readiness edge in the diff.

`relation_participation_exceptions.status` is collapsed to `isolated`, and connected participation is derived from `top_level_relations` endpoint membership. This avoids a competing participation authority.

`lifecycle.source_snapshot_refs` is stated as the current source snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` carries only prior refs. I did not find duplicated current snapshot IDs inside the transition shape.

README and IMPLEMENTATION_MAP repeat high-level authority summaries, but they are explicitly summaries pointing back to the contract rather than new field-level authority seats. I do not treat that as ontology-level duplication.

## Boundary Notes

Review was limited to the prompt-declared materialized diff and allowed context inputs. No web research was used.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version: 5; sha256:a33057efbdd985231ca6cab690b5ae0b47ccca0f539e56df6e380159bc80c3e8"
  anchor: "2. Removal Target Patterns / Relationship Redundancy"

### Domain Context Assumptions
[]