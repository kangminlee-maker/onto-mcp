## Findings

### STRUCTURE-1: Validation references `current_detail_ids`, but the lifecycle schema does not define that edge

Severity: medium

The contract now correctly makes `concept_identity_events` and `relation_identity_events` the canonical lifecycle transition authorities, and it adds `target_detail_ids` to `concept_identity_events` for demotion continuity. However, the validation expectations later say concept demotion events link prior concept IDs to known `lower_level_detail_placements[].detail_id` values through `current_detail_ids` or `target_detail_ids`.

Within the declared Seed lifecycle shape, `current_detail_ids` does not exist. The only demotion bridge field present is `concept_identity_events[].target_detail_ids`. This creates a dangling structural reference in the validation contract: an implementer could look for or accept a non-declared field, weakening the intended single demotion bridge.

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:338` defines `concept_identity_events`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:344` defines `target_detail_ids`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1013` references `current_detail_ids` even though it is not present in the lifecycle schema

Why it matters structurally:
- The contract is trying to keep lifecycle transition authority compact and canonical.
- A validation rule that names an undeclared field creates an orphan validation edge.
- It also conflicts with the requested closure point that demotion should bridge from prior concept IDs to lower-level detail IDs without introducing parallel authority.

Suggested fix:
- Replace `current_detail_ids or target_detail_ids` with only `target_detail_ids`, unless the schema intentionally adds `current_detail_ids` as a second declared lifecycle field.
- Preferred minimal fix: remove `current_detail_ids` from the validation bullet.

## Passed Structural Checks

The rest of the reviewed diff is structurally connected under the structure lens:

- `concept_identity_events` and `relation_identity_events` are identified as the canonical lifecycle transition authority, and prior/current ID arrays are used for split and merge continuity.
- `prior_concept_mappings` and `prior_relation_mappings` do not appear as parallel Seed lifecycle authorities in the reviewed material.
- `answerability_scope` has a closed declared question inventory, status-bucket partitioning, answered-by references, and canonical `supported_actions[].supported_by_question_ids[]` support edges.
- `lifecycle.source_snapshot_refs` is the current snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` is reserved for previous snapshots.
- `relation_participation_exceptions.status` is collapsed to `isolated`, and connected participation is derived from relation endpoint membership.
- `migration_records` is the canonical transitional migration seat and can point to external migration detail through `migration_artifact_ref`.
- README and IMPLEMENTATION_MAP summaries point back to `top-level-concept-discovery-contract.md` rather than restating field-level authority in competing detail.
- `source_authority_scope_changed` has traceability through changed fields plus prior/current state refs or inline states.
- Pressure transitions are connected through `frontier_pressure_log` and `pressure_events`.

## Boundary Notes

Review was limited to the prompt-declared materialized diff, the structure role definition, the review target profile, the review context manifest, and the software-engineering structure domain document. Web research was not used because the packet denied it.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/structure_spec.md"
  source_version_or_snapshot_id: "defce85754cf60b644ab765ef6d11d231fad2544e5ce3e7a946bcaf53d5a427f"
  anchor: "Golden Relationships"

### Domain Context Assumptions
[]