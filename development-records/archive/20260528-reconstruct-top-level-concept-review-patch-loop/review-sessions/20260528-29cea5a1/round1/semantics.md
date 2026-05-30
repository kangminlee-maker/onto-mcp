## Finding: `relation_participation` remains semantically ambiguous in the Seed output shape

Severity: medium

What: The contract text correctly defines `relation_participation` as an exception/projection seat only for concepts not yet connected by `top_level_relations` (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:462`). However, the Seed output shape still lists `relation_participation` directly under every `top_level_concepts[]` item (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:815`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:831`).

Why: Semantically, the field name and enum values only describe isolated concepts: `provisionally_isolated | boundary_isolated`. If implementers treat the output shape as required for every concept, connected concepts have no truthful value. That weakens the intended meaning that connected participation is derived only from relation endpoint membership.

How to fix: Mark `relation_participation` as optional/exception-only in the output shape, for example:

```yaml
top_level_concepts:
  - concept_id:
    ...
    relation_participation: # present only when the concept is not connected by top_level_relations
      status: provisionally_isolated | boundary_isolated
      isolation_reason:
      isolation_pressure_ids: []
```

Or split the example into “common concept record” and “isolated concept exception projection.”

## Finding: Top-level Seed purpose still says “open questions” while the answerability model uses closed classified question sets

Severity: low

What: The position statement says the Seed carries “supported questions, open questions, and deferred lower-level details” (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:14`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:17`). The later contract defines a closed `declared_handoff_questions` inventory classified exactly into `supported_questions`, `deferred_questions`, and `unsupported_questions` (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:184`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:207`).

Why: “Open questions” is a legacy/common-language phrase, but the new semantic authority is not an open-ended question bucket. It is a closed answerability inventory. This could reintroduce the old `open_questions` interpretation that the compatibility section is trying to retire (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:961`).

How to fix: Reword the position statement to “supported, deferred, and unsupported handoff questions” or “answerability scope” instead of “open questions.”

## Correct Semantics Confirmed

The patch otherwise preserves the intended meanings of the reviewed concepts:

- Demotion now has a clear semantic bridge from prior concept IDs to lower-level detail IDs through lifecycle mappings/events and `lower_level_detail_placements` (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:317`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:319`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1035`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1037`).
- `migration_records` is correctly named as the transitional migration authority and external migration artifacts remain refs, not prose-only claims (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:977`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:980`).
- `answerability_scope` meaning is grounded as bounded Seed-stage support, not full ontology readiness (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:111`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:144`).
- Relation kinds and axes are semantically distinct and design-local; `related_to` is explicitly non-directional (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:487`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:519`).
- README and IMPLEMENTATION_MAP summaries correctly point to the reconstruct contract as the field-level authority without duplicating the detailed contract semantics (`README.md:281`-`README.md:288`, `IMPLEMENTATION_MAP.html:670`).

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version: 8; source_sha256: 9879135c1a5adf1045c7b8dd61738cd12caa3e8fa0305f1b4095e99649f9dc9c"
  anchor: "LLM-Native Engineering Terms"

### Domain Context Assumptions
[]