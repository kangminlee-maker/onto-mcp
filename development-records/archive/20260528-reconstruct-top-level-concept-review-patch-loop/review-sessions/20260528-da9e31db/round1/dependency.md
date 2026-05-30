# dependency

## Verdict

Material dependency/design-contract issue remains.

The patch substantially improves directed relation authority: `top_level_relations` is made canonical, endpoint order is defined, `related_to` is explicitly non-directional, pressure refs are routed through `frontier_pressure_log`, and convergence depends on relation graph, answerability, material coverage, and lifecycle inputs. This closes the main prior class of unclear relation/pressure dependency issues from the dependency lens.

## Findings

### Medium — Retired `boundary_notes` migration points to a non-existent target authority seat

The legacy compatibility table maps retired `boundary_notes` to `top_level_concepts[].boundary_statement` or a derived final-output summary, but the concept-centered Seed shape defines `top_level_concepts[].boundary` with `included_summary`, `excluded_summary`, and `deferred_summary`; it does not define `boundary_statement`.

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:799` defines `boundary:`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:800` defines `included_summary`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:801` defines `excluded_summary`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:802` defines `deferred_summary`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:935` maps `boundary_notes` to `top_level_concepts[].boundary_statement`

Why this is a dependency issue:
The migration table creates a directed mapping dependency from a retired seat to a target authority. Because that target authority is absent from the canonical shape, downstream migration validation or artifact authoring must either infer a target field or create a competing projection. That is an implicit dependency and a dangling directed relation in the design contract.

How to fix:
Either change the mapping target to `top_level_concepts[].boundary` and specify how `boundary_notes` preserve meaning across `included_summary`, `excluded_summary`, and `deferred_summary`, or add `boundary_statement` to the canonical concept shape as the authority/projection explicitly. Prefer the first path if the intended authority is the structured boundary object.

## Non-Issues Observed

- Relation authority direction is now explicit: directional kinds use ordered endpoints, while `related_to` states that endpoint order is serialization-only, not a semantic direction claim.
- Pressure refs now consistently point to `frontier_pressure_log[].pressure_id`, reducing competing pressure-dependency seats.
- Convergence now depends on `top_level_relations`, `frontier_pressure_log`, `answerability_scope`, `material_coverage_checkpoint`, lifecycle events, and runtime validation, which makes the dependency chain for Seed handoff explicit.
- README and `IMPLEMENTATION_MAP.html` are aligned at summary level with the new contract topics and do not introduce a conflicting dependency direction.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/dependency_rules.md"
  source_version_or_snapshot_id: "version 6, last_updated 2026-05-28"
  anchor: "Direction Rules / Dependency Direction Vocabulary"
- source_doc: ".onto/domains/software-engineering/dependency_rules.md"
  source_version_or_snapshot_id: "version 6, last_updated 2026-05-28"
  anchor: "Type Location and Dependency Direction"

### Domain Context Assumptions
[]