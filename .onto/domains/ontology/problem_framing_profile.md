---
version: 1
last_updated: "2026-05-21"
source: issue-stance-deliberation-contract
status: design_target
doc_type: custom:problem_framing_profile
---

# Ontology Domain — Problem Framing Profile

This profile defines ontology-specific axes for review closure problem framing.
It extends the common spine in `.onto/processes/review/issue-stance-deliberation-contract.md`.

The profile does not redefine common spine values.

## Domain Axes

### ontology_surface

Required when an issue affects ontology structure, authority, or evolution.

| Value | Meaning |
|---|---|
| `concept_identity` | entity, term, canonical label, alias, or identity boundary |
| `relation_model` | relation type, direction, cardinality, inverse handling, or relation ownership |
| `classification_system` | type hierarchy, axis definition, MECE boundary, or classification completeness |
| `constraint_model` | invariant, validation rule, cardinality, or logical compatibility |
| `authority_seat` | canonical owner document, precedence, or source-of-truth placement |
| `profile_boundary` | domain/profile extension boundary or activation condition |
| `provenance_traceability` | origin, transformation, or evidence trail for ontology changes |
| `evolution_path` | extension, migration, deprecation, or future compatibility path |

### ontology_issue_kind

Required when the issue can be expressed as an ontology-design problem type.

| Value | Meaning |
|---|---|
| `concept_drift` | concept wording or meaning moved away from its canonical use |
| `axis_conflict` | multiple classification axes collide or are applied inconsistently |
| `missing_authority` | no canonical seat owns the concept, rule, or decision |
| `authority_overlap` | multiple seats claim the same authority without precedence |
| `coverage_gap` | required concept, relation, constraint, or competency area is missing |
| `traceability_gap` | relation from claim to evidence, source, or owner is incomplete |
| `scope_creep` | ontology includes concepts outside declared purpose without rationale |
| `extension_rule_gap` | the path for adding or changing values is unclear |
| `stale_term` | active term remains understandable but no longer matches current usage |

### ontology_evidence_need

Optional. Use when the next useful evidence path matters to closure.

| Value | Meaning |
|---|---|
| `lexicon_check` | core lexicon concept or term entry should be checked |
| `authority_precedence_check` | authority hierarchy or precedence needs verification |
| `cross_document_trace` | relation across multiple ontology/process/domain docs must be traced |
| `instance_counterexample` | concrete instance is needed to validate or refute the issue |
| `domain_profile_review` | domain-specific profile or domain document boundary needs review |
| `maintainer_decision` | ontology owner decision is the next verification gate |

## Rules

1. `ontology_surface` and `ontology_issue_kind` may be omitted only when the issue is outside ontology substance.
2. `stale_term` must state whether the stale wording changes runtime behavior, reasoning behavior, or only reader interpretation.
3. `missing_authority` and `authority_overlap` should identify the nearest existing authority seat before proposing a new one.
4. `extension_rule_gap` should be used when adding values is plausible but the activation or validation rule is not defined.
