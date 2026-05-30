## Findings

- [medium] `relation_participation` is still shown as an unconditional concept field in the Seed output projection, even though the contract now defines it as an exception/projection seat only for concepts not connected by `top_level_relations`. In the same patch, connected participation is explicitly derived from endpoint membership and `relation_participation` “must not duplicate endpoint membership” (`materialized-input.md` lines 428-433), but the output shape lists `relation_participation` under every `top_level_concepts[]` item with only isolated statuses (`materialized-input.md` lines 842-863). This creates an implicit dependency conflict for every connected concept: either it must emit an isolation-only field that is false, or omit a field that the shape appears to require. Fix by marking `relation_participation` as optional and present only for isolated concepts, or by moving it to a separate `relation_participation_exceptions` list keyed by `concept_id`. Do not add a `connected` status unless the contract intentionally wants a second projection of endpoint membership.

## Correctness Notes

- The core relation graph direction model is otherwise materially improved. `top_level_relations` is established as the canonical relation authority, per-concept summaries are derived, endpoints are ordered for directional relation kinds, and `related_to` is explicitly non-directional serialization (`materialized-input.md` lines 403-493). This matches the dependency lens concern that directed relation claims should have a single authority and should not be silently inverted.
- Pressure and convergence dependencies are now routed through `frontier_pressure_log[].pressure_id`, with non-open pressure states and convergence rejection while any pressure remains `open` (`materialized-input.md` lines 554-632, 710-712). That closes the prior implicit dependency from convergence prose to unmaterialized pressure state.
- Demotion and migration dependency paths are materially clearer: prior concept IDs can map to `current_detail_ids`, demotion identity events can target lower-level detail IDs, and validation requires demotion mappings/events to link prior concept IDs to known `lower_level_detail_placements[].detail_id` values (`materialized-input.md` lines 297-325, 1104-1106).
- Lifecycle continuity for split/merge transitions is directionally sound because array fields are declared as the authority for one-to-many and many-to-one mappings, while singular fields are only compatibility/display projections (`materialized-input.md` lines 392-401).
- README and IMPLEMENTATION_MAP changes are dependency-safe summaries: both point readers back to `top-level-concept-discovery-contract.md` as field-level authority instead of introducing competing relation or migration rules (`materialized-input.md` lines 1225, 1238-1242).

## Boundary And Evidence Limits

No web research was performed because the prompt boundary denies web research. Review was limited to the authoritative prompt packet, materialized diff input, role definition, review target/profile manifest, and the declared software-engineering domain documents.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/dependency_rules.md"
  source_version_or_snapshot_id: "version: 6, last_updated: 2026-05-28"
  anchor: "Direction Rules"
- source_doc: ".onto/domains/software-engineering/dependency_rules.md"
  source_version_or_snapshot_id: "version: 6, last_updated: 2026-05-28"
  anchor: "Dependency Direction Vocabulary"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version: 4, last_updated: 2026-05-28"
  anchor: "Response Format Constraints"

### Domain Context Assumptions
[]