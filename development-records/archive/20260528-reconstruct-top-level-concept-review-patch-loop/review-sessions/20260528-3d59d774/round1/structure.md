# structure

## Findings

### Medium: Demoted concept lifecycle is still structurally disconnected from the lower-level detail authority

What: The contract says demoting a concept must preserve the prior concept ID and move the current representation to `lower_level_detail_placements`, but the lifecycle structures do not provide a deterministic link from the demoted concept event/mapping to the resulting `detail_id`.

Why: `prior_concept_mappings` supports `mapping_type: demoted` but only carries prior/current concept IDs. `concept_identity_events` supports `event_type: demoted` but also only carries concept IDs. `detail_placement_events` carries `detail_ids`, but no prior concept IDs. This leaves the demoted concept's current representation structurally orphaned from the detail placement authority. A runtime validator could verify that a concept was demoted and that a detail was placed, but not that they are the same lifecycle transition.

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:306` requires demotion to move the current representation to lower-level detail placement authority.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:324` defines concept mappings without a detail target ref.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:345` defines concept identity events without a detail target ref.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:377` defines detail placement events without prior concept refs.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:507` names `lower_level_detail_placements` as the canonical authority for demoted details.

How to fix: Add an explicit demotion bridge, for example `current_detail_ids` / `target_detail_ids` on `prior_concept_mappings` and `concept_identity_events` when `mapping_type` or `event_type` is `demoted`, or add `prior_concept_ids` to `detail_placement_events`. Then add a validation expectation that demoted concept lifecycle refs point to known `lower_level_detail_placements[].detail_id`.

### Low: External migration artifact refs are mentioned but not structurally seated

What: The contract says `migration_records` may point to an external migration artifact when the record is too large for the Seed, but the shown `migration_records` shape has no field for that ref.

Why: This creates a missing relationship between the Seed-level migration record and the external artifact that is allowed to hold the larger mapping. The contract requires the Seed to carry the ref, but the schema projection does not show where it lives.

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:894` defines the `migration_records` shape without an artifact/ref field.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:957` says the record may point to an external migration artifact and that the Seed must carry the ref.

How to fix: Add a nullable field such as `migration_artifact_ref` or `external_record_ref` to `migration_records`, and add a deterministic validation expectation that the ref is present when compatibility is claimed from an external migration artifact.

## Confirmed Structurally Connected

The previously targeted areas are largely connected in the current diff:

- `boundary_notes` now maps to the existing `top_level_concepts[].boundary` object, with included/excluded/deferred summary placement.
- `alias_changed` has prior/current alias arrays.
- `source_authority_scope_changed` has prior/current state refs and inline prior/current state seats.
- pressure lifecycle events now include prior/new status, current pressure ID, and supersession refs.
- answerability status is encoded by list membership, not a duplicate `question_status` field.
- relation graph authority, concept participation, and endpoint validation are connected to `top_level_relations`.
- README and `IMPLEMENTATION_MAP.html` both reflect the new contract areas at a summary level.

## Boundary Notes

Review stayed within the declared filesystem boundary and used only the prompt packet, materialized diff, required role/context files, the domain structure spec, and directly changed target files. Web research was denied and not used.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/structure_spec.md"
  source_version_or_snapshot_id: "version 6; sha256:defce85754cf60b644ab765ef6d11d231fad2544e5ce3e7a946bcaf53d5a427f"
  anchor: "Golden Relationships / LLM-Native System Structure"

### Domain Context Assumptions
[]