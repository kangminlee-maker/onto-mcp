# Conciseness Lens Review

## Findings

### C-1 — Material: active summary docs duplicate the contract’s detailed authority catalog

**What:** `README.md` and `IMPLEMENTATION_MAP.html` now repeat a long catalog of the same reconstruct Seed authority fields already defined in `.onto/processes/reconstruct/top-level-concept-discovery-contract.md`.

**Evidence:**
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:78` defines the obligation/promotion boundary, and the detailed authority seats follow in the contract body.
- `README.md:284` through `README.md:292` repeats the authority list: answerability scope, canonical relations, lower-level detail placements, frontier pressure, material coverage, convergence, lifecycle, migration records, pressure semantics, answerability refs, material source-authority boundaries, lifecycle continuity, relation participation, and retired-seat compatibility.
- `IMPLEMENTATION_MAP.html:670` repeats the same catalog again in the active reconstruct row.

**Why this is a conciseness issue:** The contract is the authority. The README and implementation map are active navigation/summary surfaces, but the new wording copies a detailed field catalog into two additional active locations. From the conciseness lens, this creates multiple active definitions or near-definitions of the same authority surface and increases drift risk without adding a distinct concept. The software-engineering conciseness rules prefer references over copied definitions when repeated context is only there to help a consumer load a case.

**How to fix:** Keep README and IMPLEMENTATION_MAP at the level of outcome and authority reference. For example, say that the contract now defines the concept-centered Seed authority surface, answerability, lifecycle/provenance, migration compatibility, and deterministic validation boundaries, then point readers to the contract for the field-level catalog. Do not enumerate the full authority list in both active docs.

### C-2 — Material: `relation_participation.status: connected` duplicates endpoint membership authority

**What:** The contract declares `top_level_relations` as the canonical relation graph authority, then requires each concept to carry `relation_participation.status`, including `connected`, while also saying runtime validates `connected` by checking whether the concept appears in relation endpoints.

**Evidence:**
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:427` through `:430` makes `top_level_relations` the canonical relation authority and allows per-concept relation summaries only as derived projections.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:432` through `:445` requires concept participation status.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:448` through `:452` says the field is not a second relation authority and validates `connected` by endpoint membership.

**Why this is a conciseness issue:** For `connected`, the status is fully derivable from `top_level_relations`. That makes it a subordinate redeclaration of the canonical relation authority. The isolation cases are meaningful because they add reasons and pressure refs, but the positive `connected` value does not add a distinct concept or constraint.

**How to fix:** Make relation participation an exception/projection seat rather than a required status for every concept. For example, require an isolation object only when a concept is not connected, and derive connected participation from endpoint membership. If the field must stay for display compatibility, mark `connected` explicitly as `derived_summary` and not Seed-authored authority.

## Non-Issues Checked

The lifecycle design carries both `prior_*_mappings` and `*_identity_events`, but the contract distinguishes cross-Seed transition projections from event/provenance logs and requires derivability or shared IDs/evidence refs. That distinction is sufficient from a conciseness perspective.

The answerability design avoids a separate `question_status` field and encodes status through membership in `supported_questions`, `deferred_questions`, or `unsupported_questions`, which is concise and avoids duplicate state.

## Boundary Limitations

Web research was denied by the prompt packet, so no web citation was used. Review was limited to the authoritative materialized input plus the role definition, the software-engineering conciseness rules, and the smallest direct file checks needed for line-level evidence.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version: 5; last_updated: 2026-05-28"
  anchor: "§2 Removal Target Patterns / Relationship Redundancy"
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version: 5; last_updated: 2026-05-28"
  anchor: "§2 Removal Target Patterns / Definition Redundancy"
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version: 5; last_updated: 2026-05-28"
  anchor: "§4 Boundaries — Domain-specific Application Cases"

### Domain Context Assumptions
[]