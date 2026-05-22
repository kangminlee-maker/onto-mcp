---
version: 1
last_updated: "2026-03-29"
source: bundled-domain-baseline
status: established
---

# Conciseness Rules (ontology)

This document contains the domain-specific rules that conciseness references during conciseness verification.
It is organized in the order: **type (allow/remove) -> verification criteria -> role boundaries -> measurement methods**.

---

## 1. Allowed Redundancy

Each rule is tagged with a severity level:
- **[MUST-ALLOW]**: Redundancy that breaks the system if removed. Must be retained.
- **[MAY-ALLOW]**: Redundancy kept for convenience. Can be consolidated, but only remove when the benefit clearly outweighs the consolidation cost.

### Dual Constraint Definitions

- [MUST-ALLOW] Dual description of axioms and natural language definitions — the same constraint is defined in both formal axioms and natural language. Axioms are verified by the reasoner, and natural language is interpreted by humans. Removing either makes machine verification or human interpretation impossible.
- [MUST-ALLOW] Parallel definition of OWL constraints and SHACL constraints — OWL performs TBox-level reasoning, while SHACL performs instance-level data validation. The verification targets and purposes differ, so consolidation is not possible.

### Multiple Representation Types

- [MUST-ALLOW] Axiom/graph/taxonomy representations of the same concept — axiom representation (OWL DL) is for logical reasoning, graph representation (RDF triples) is for exploration/querying, and taxonomy representation is for understanding hierarchical structure. Each representation serves a different consumer (reasoner, query engine, human), so removing one blocks that consumer's access.
- [MAY-ALLOW] Parallel RDFS and OWL declarations of the same relation — RDFS is referenced by lightweight ontology tools, while OWL is referenced by reasoners. If the consuming tools are unified, consolidation into one is possible.

### Ontology Alignment

- [MUST-ALLOW] Internal reference copies of external ontology concepts — classes/properties from external ontologies (e.g., Dublin Core, SKOS) are redeclared internally or maintained as mapping specifications. Removing them makes it impossible to track external changes and verify alignment.
- [MAY-ALLOW] Parallel declaration of owl:equivalentClass and skos:exactMatch for the same mapping — if formal equivalence (for reasoning) and lexical correspondence (for exploration) serve separate purposes, retain both. If consumers use only one representation, consolidation is possible.

### Meta Model

- [MAY-ALLOW] Defining the same concept separately in both the upper ontology and the domain ontology — the upper ontology provides domain-independent definitions, while the domain ontology adds domain-specific constraints. If fully redundant, replace the domain side with a reference to the upper ontology.

---

## 2. Removal Target Patterns

Each rule is tagged with a severity level:
- **[MUST-REMOVE]**: Redundancy whose mere existence causes errors or incorrect inferences.
- **[SHOULD-REMOVE]**: Redundancy that is not very harmful but adds unnecessary complexity.

### Entity-Relation Ratio Imbalance

- [MUST-REMOVE] Entity-relation ratio imbalance (>3:1) — when the number of class definitions exceeds the number of relation definitions by more than 3:1, entities are merely listed without semantic connections between them. In this state, the reasoner cannot derive inter-class relations, and path-based answers to competency questions are impossible. Relations must be added or isolated classes removed.

### Classes Without Instances

- [MUST-REMOVE] Classes with no instances — a class with no instances in the ABox is an empty definition not connected to actual data. It is a removal target. However, the following two cases are exceptions:
  - Explicitly declared as an abstract class with only subclasses having instances
  - Registered in extension_cases.md as reserved for future expansion

### Relation Redundancy

- [MUST-REMOVE] Multiple path representations of the same relation — when A->B and A->C->B have the same meaning, retain only one path. Maintaining both causes inconsistencies due to missed updates. If a transitive relation is already declared, explicit redeclaration of intermediate paths is unnecessary.
- [MUST-REMOVE] Subclass redeclaration of constraints already guaranteed by the superclass — when the superclass declares domain/range constraints, there is no need to repeat the same constraints in subclasses. They are automatically inherited via the is-a relation.

### Classification Redundancy

- [SHOULD-REMOVE] Intermediate hierarchy nodes with only 1 child — they have no classification significance and should be merged with the parent. However, retain if future subclass expansion is planned and registered in extension_cases.md.
- [SHOULD-REMOVE] Mixed classification criteria at the same hierarchy level — when functional and structural classification coexist at the same level, cross-classification occurs. Unify to a single classification criterion or restructure as faceted classification.

### Definition Redundancy

- [MUST-REMOVE] Duplicate definitions of the same concept under different IRIs/names — use the synonym mappings in concepts.md and owl:equivalentClass declarations as the basis for identification. Retain only one canonical IRI and treat the rest as synonyms (skos:altLabel).
- [SHOULD-REMOVE] Same axiom copied across multiple modules — extract to a common module (upper ontology or shared module) and reference via import.

---

## 3. Minimum Granularity Criteria

A sub-classification is permitted only if it satisfies **at least one** of the following. If none are satisfied, merge with the parent.

1. **Competency question difference**: Does it generate a different answer to a question in competency_qs.md?
2. **Constraint difference**: Do different constraints (cardinality, domain/range, axioms) apply?
3. **Inference result difference**: Does the reasoner produce a different classification result or consistency determination?

Examples:
- `PhysicalObject` and `AbstractObject` are justified as separate classifications because different constraints (presence/absence of spatial location properties) apply.
- If `Entity` and `Thing` have the same axioms, same relations, and same instances, they are candidates for merging.

---

## 4. Boundaries — Domain-Specific Application Cases

The authoritative source for boundary definitions is `roles/conciseness.md`. This section describes only the specific application cases in the ontology domain.

### pragmatics boundary

- conciseness: Does an unnecessary element **exist**? (structural level)
- pragmatics: Does unnecessary information **hinder** query execution? (execution level)
- Example: A property unused in SPARQL queries slows down results -> pragmatics. An unused class is defined in the TBox -> conciseness.

### coverage boundary

- conciseness: Does something exist that should not? (reduction direction)
- coverage: Is something missing that should exist? (expansion direction)
- Example: Relation types (part-of, depends-on, etc.) are not defined -> coverage. The same relation is duplicated under two different property names -> conciseness.

### logic boundary (predecessor/successor relationship)

- logic predecessor: determines logical equivalence (entailment)
- conciseness successor: decides whether to remove after equivalence is confirmed
- Example: A superclass axiom entails a subclass axiom -> logic determines equivalence -> conciseness determines "subclass axiom redeclaration is unnecessary."

### semantics boundary (predecessor/successor relationship)

- semantics predecessor: determines semantic identity (synonym status, owl:equivalentClass status)
- conciseness successor: decides whether merging is needed after synonym confirmation
- Example: `Person` and `Human` are the same concept -> semantics determines they are synonyms -> conciseness determines "consolidate to a single canonical IRI."

---

## 5. Quantitative Criteria

Observed thresholds from the domain are recorded as they accumulate.

- Entity-relation ratio: when the number of class definitions exceeds the number of relation (Object Property) definitions by more than 3:1, it is determined as structural bias (entity overload)
- (Additional thresholds are accumulated through reviews)

---

## Related Documents

- `concepts.md` — term definitions, synonym mappings, homonym lists (semantic criteria for redundancy determination)
- `structure_spec.md` — isolated node rules, required relation requirements (structural removal criteria)
- `competency_qs.md` — competency question list (criteria for "actual difference" in minimum granularity determination)
- `domain_scope.md` — ontology type classification, bias detection criteria (context for entity-relation ratio determination)
- `logic_rules.md` — constraint conflict checking rules (criteria for logical equivalence determination)
