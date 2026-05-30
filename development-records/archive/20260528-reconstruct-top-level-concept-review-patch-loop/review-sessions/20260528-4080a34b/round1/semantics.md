# semantics

## Verdict

No material semantics issue found within the declared boundary.

The patch correctly uses concept-centered names and authority seats in a way that matches their stated meanings. The revised contract distinguishes semantic judgment from deterministic runtime validation, treats the Seed as a purpose-relative handoff artifact rather than a full ontology, and avoids introducing alternate lifecycle or demotion authorities that would blur concept meaning.

## Findings

None.

## Semantic Verification Notes

Structural inspection was limited to the materialized diff target and the authorized semantics/domain inputs. Within that scope:

- `concept_identity_events` and `relation_identity_events` are semantically named as lifecycle transition authorities, and the contract explicitly says their prior/current ID arrays are the canonical lifecycle transition authority.
- No competing `prior_concept_mappings` or `prior_relation_mappings` authority appears in the Seed lifecycle shape.
- No undefined `current_detail_ids` or alternate demotion bridge field appears. Demotion lineage is assigned only to `concept_identity_events[].target_detail_ids`, with `lower_level_detail_placements[].detail_id` as the current detail authority.
- `detail_placement_events` correctly describes placement changes without carrying prior concept lineage.
- Generic affected `concept_ids` or `relation_ids` are excluded from identity event authority; the patch names the specific prior/current identity arrays instead.
- `answerability_scope` uses status-bucket membership for question status and `supported_actions[].supported_by_question_ids[]` as the canonical support edge from supported questions to supported actions.
- `lifecycle.source_snapshot_refs` is named as the current source snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` records prior refs only.
- `relation_participation_exceptions.status` is collapsed to `isolated`, which matches its meaning as an exception/projection rather than a second relation authority.
- `migration_records[].migration_artifact_ref` preserves external migration artifact references without making prose a competing migration authority.
- `source_authority_scope_changed` has semantically adequate prior/current traceability through state refs or inline prior/current authority states.
- Pressure lifecycle uses a single `pressure_id` authority and does not introduce overlapping `pressure_ids` or `current_pressure_id`.
- `relation_axis` is not stored as a Seed field; axis remains a derived projection from `relation_kind`.
- README and `IMPLEMENTATION_MAP.html` summaries are appropriately simplified as authority references rather than duplicating field-level contract detail.

These names and relations align with the software-engineering domain distinction between LLM semantic judgment and runtime deterministic gates: runtime validates shape, refs, endpoints, enum values, provenance, and artifact seats, while the LLM/lens layer owns semantic compactness, concept correctness, purpose fitness, and relation interpretation.

## Boundary And Evidence

Web research was denied by the prompt packet, so no web sources were consulted. The review used only the declared repository-local material and domain documents.

Evidence used:

- `.onto/review/20260528-4080a34b/execution-preparation/materialized-input.md`
- `.onto/roles/semantics.md`
- `.onto/review/20260528-4080a34b/interpretation.yaml`
- `.onto/review/20260528-4080a34b/binding.yaml`
- `.onto/review/20260528-4080a34b/execution-preparation/review-target-profile.yaml`
- `.onto/review/20260528-4080a34b/execution-preparation/review-context-manifest.yaml`
- `.onto/domains/software-engineering/concepts.md`
- `.onto/domains/software-engineering/prompt_interface.md`

### Domain Constraints Used

- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version: 8"
  anchor: "LLM-Native Engineering Terms"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version: 4"
  anchor: "Ownership Boundary Structure"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version: 4"
  anchor: "Response Format Constraints"

### Domain Context Assumptions

[]