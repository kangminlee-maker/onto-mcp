---
version: 2
last_updated: "2026-03-30"
source: bundled-domain-baseline
status: established
---

# Ontology Domain — Logic Rules

Classification axis: **normative system** — rules classified by the specification or standard that governs them.

## Classification Logic

- If class B rdfs:subClassOf class A AND A has restriction (owl:minCardinality 1 on property P) → B inherits this restriction. If B redefines P with owl:minCardinality 0, this is an is-a violation. Reference: OWL 2 Structural Specification, Section 9.1.1 (Subclass Axioms)
- If sibling classes at the same hierarchy level use different classification criteria (e.g., one functional, one structural) → cross-classification. Resolution: partition by a single criterion per level, then refine within each branch. Reference: Ontology Design Patterns — Partition Pattern
- If a set of subclasses is declared as owl:disjointUnionOf a superclass → the subclasses must be (1) pairwise owl:disjointWith AND (2) their union must be owl:equivalentClass to the superclass. If only (1) is satisfied, the partition is incomplete (unlisted instances are possible). If only (2) is satisfied, overlap is permitted. Reference: OWL 2 Structural Specification, Section 9.1.4 (Disjoint Union)
- If multiple inheritance exists (class D rdfs:subClassOf B and D rdfs:subClassOf C, where B and C both have restrictions on property P with different values) → this is a diamond inheritance conflict. Resolution: D must explicitly declare its own restriction on P that is consistent with both inherited restrictions. If no consistent restriction exists, the class hierarchy must be revised. Reference: OWL 2 Direct Semantics — class expressions are interpreted as set intersections under multiple inheritance

## Constraint Logic

- If property P has rdfs:domain A → any individual x used as subject of P is inferred to be rdf:type A. This is classification (inference), not validation (rejection). If the intent is validation, use SHACL sh:class instead. Reference: RDFS Semantics, Section 3.2.2; SHACL, Section 4.1
- If a property has owl:minCardinality N and owl:maxCardinality M where N > M → the class is unsatisfiable (no individual can satisfy it). This destroys ontology consistency. The reasoner will mark the class as equivalent to owl:Nothing. Reference: OWL 2 Direct Semantics, Section 2.3.2
- Under OWL's Open World Assumption (OWA), the absence of a property assertion means "unknown," not "false." If reasoning about absence is required → use SHACL (Closed World validation) or define explicit negation via owl:complementOf. Reference: OWL 2 Primer, Section 3.2 (Open World Assumption)
- If an enumeration constraint (owl:oneOf) is defined without a Closure Axiom (owl:allValuesFrom on the same property) → the reasoner assumes additional unstated values may exist. To enforce that only the enumerated values are valid, add an owl:allValuesFrom restriction. Reference: OWL 2 Structural Specification, Section 8.1.4

## Reasoning Logic

- Transitivity: if property P is declared owl:TransitiveProperty, then P(A,B) AND P(B,C) → P(A,C). Not all part-of relations should be transitive. Example: "finger part-of hand" and "hand part-of person" does not necessarily mean "finger part-of person" in all modeling contexts. If selective transitivity is needed, use property chains (owl:propertyChainAxiom) instead. Reference: OWL 2 Structural Specification, Section 9.2.6
- Symmetry: if property P is declared owl:SymmetricProperty, then P(A,B) → P(B,A). If P is declared owl:AsymmetricProperty, then P(A,B) → NOT P(B,A). Declaring both symmetric and asymmetric on the same property is a contradiction. Reference: OWL 2 Structural Specification, Section 9.2.8 and 9.2.10
- If a reasoner detects inconsistency → isolate the axioms to a minimal unsatisfiable subset (justification). Tools: HermiT and Pellet provide justification extraction. Without isolation, correction is impractical because the entire ontology entails everything (ex falso quodlibet). Reference: OWL 2 Conformance, Section 3
- If inference results differ from intent → distinguish whether the axiom is wrong (formal error) or the intent is wrong (modeling decision error). Formal correctness and semantic correctness are independent. A formally correct ontology may not model the intended domain accurately

## Naming Logic

- Multiple labels (rdfs:label, skos:prefLabel, skos:altLabel) may exist for the same concept. However, one URI must identify exactly one concept (URI uniqueness principle). If two URIs refer to the same concept, declare owl:sameAs. Reference: OWL 2 Structural Specification, Section 5.1 (Ontology IRI and Version IRI)
- Homonyms (same natural language term, different meaning) must be assigned distinct URIs. Each URI must include rdfs:comment or skos:scopeNote specifying the intended scope
- If a natural language label changes but the concept remains the same → retain the URI, update rdfs:label, and record the change in owl:versionInfo or skos:changeNote. URI stability is essential for interoperability

## OWL 2 Profile Expressivity Rules

OWL 2 defines computational profiles that trade expressivity for decidability and computational complexity. If an ontology declares a profile, all axioms must conform to that profile's restrictions. Reference: OWL 2 Profiles (W3C Rec), all sections below reference this document.

- **EL profile**: Allows existential restrictions (exists r.C), conjunction (C intersect D), top, bottom, nominals ({a}), concrete domains (datatypes). Does NOT allow universal restrictions (forall r.C), complement (not C), disjunction (C union D). Designed for large terminologies (e.g., SNOMED CT). Subsumption and classification are polynomial time
- **QL profile**: Allows concept inclusions, role inclusions, role disjointness, asymmetry, reflexivity. Does NOT allow existential restrictions on the right side of inclusion axioms. Designed for query answering over relational databases. Conjunctive queries are rewritable to SQL (LOGSPACE data complexity)
- **RL profile**: Allows all OWL 2 constructs but only in specific syntactic positions — certain constructs are restricted to superclass position (never subclass position) and vice versa. Designed for rule-based implementation. Reasoning is polynomial in the combined size of the ontology and data
- **DL profile**: SROIQ(D). Full OWL 2 expressivity minus features incompatible with RDF (e.g., non-simple roles in cardinality restrictions require additional role regularity constraints). Decidable. Worst-case complexity is 2NEXPTIME, but practical performance is acceptable for most ontologies
- **Full OWL 2**: Extends DL to allow classes as instances (metamodeling), properties as classes, and other RDF-compatible constructs. Undecidable. Consistency checking is not guaranteed to terminate. Reasoners may approximate or refuse to process Full OWL 2 ontologies
- Rule: If an ontology uses constructs outside its declared profile → profile violation. The reasoner's behavior is implementation-dependent: some silently ignore unsupported constructs, some raise errors, some fall back to a less restricted profile. Verify profile conformance before deployment using OWL 2 profile checking tools (e.g., OWL API's profile checker)

## SHACL Validation Logic

SHACL (Shapes Constraint Language) validates RDF data against a set of conditions called shapes. It operates under fundamentally different assumptions than OWL. Reference: SHACL (W3C Rec).

- SHACL operates under the Closed World Assumption (CWA). A missing property value is a validation failure in SHACL but merely "unknown" in OWL (OWA). If both are applied to the same data, this assumption difference produces different results for absent data. Reference: SHACL, Section 1 (Introduction)
- sh:class constraint validates that the object of a property has a specific rdf:type. If the instance's rdf:type does not match → SHACL violation. Under OWL, the reasoner would infer the type (classification) rather than reject. If SHACL validation fails but OWL reasoning succeeds, check whether type inference would resolve the discrepancy
- SHACL severity levels: sh:Violation (must fix — data is invalid), sh:Warning (should review — data is suspect), sh:Info (informational — advisory). Map these to verification finding severity in the review process. Reference: SHACL, Section 2.1 (Validation Results)
- When SHACL shapes and OWL axioms define overlapping constraints on the same class/property: SHACL validates instance data (ABox) and OWL validates schema consistency (TBox). If results conflict → (1) check if the CWA vs OWA assumption difference is the cause (2) if not, it is a genuine constraint conflict requiring resolution. Reference: SHACL, Section 1.3 (Relationship between SHACL and OWL)
- SHACL can validate constraints that OWL cannot express: string patterns (sh:pattern — regex validation), value ranges (sh:minInclusive, sh:maxExclusive — numeric bounds), conditional constraints (sh:if/sh:then — context-dependent validation), SPARQL-based constraints (sh:sparql — arbitrary query validation). When a constraint cannot be expressed in OWL, SHACL is the appropriate mechanism. Reference: SHACL, Sections 4 (Core Constraint Components) and 6 (SPARQL-based Constraints)

## Open World vs Closed World Reasoning

The distinction between OWA and CWA is a fundamental source of semantic mismatches in ontology-based systems. Each technology in the semantic web stack adopts one or the other, and mixing them without explicit documentation causes incorrect conclusions.

- If ontology uses OWA (OWL default) AND application requires negation-as-failure → explicitly document the assumption gap. The application treats "no data" as "false" while the ontology treats it as "unknown." Without documentation, validation logic will produce false negatives (rejecting data that OWL considers consistent). Reference: OWL 2 Primer, Section 3.2
- If ontology is queried via SPARQL → SPARQL's FILTER NOT EXISTS operates under CWA (it returns true when matching data is absent in the dataset). This contradicts OWL's OWA. A query that returns no results does not mean the statement is false — it means the dataset does not contain evidence. Document this semantic mismatch in the ontology's usage documentation. Reference: SPARQL 1.1 Query Language, Section 8 (Negation)
- If both OWL and SHACL are used on the same data → OWL reasons under OWA, SHACL validates under CWA. A property value absent from the data will pass OWL consistency checking but fail SHACL validation if sh:minCount 1 is declared. This is expected behavior, not a bug. Reference: SHACL, Section 1; OWL 2 Direct Semantics, Section 2.1
- Resolution pattern: Use OWL for TBox reasoning (class relationships, subsumption, consistency of the schema). Use SHACL for ABox validation (instance data completeness, value constraints, data quality). Do not mix their assumptions — treat each tool's output within its own assumption context. Cross-reference: logic_rules.md 'SHACL Validation Logic'; concepts.md (OWA/CWA definitions)

## Description Logic Inference Patterns

OWL 2 is grounded in Description Logic (DL). The following inference patterns are the standard reasoning services that ontology reasoners provide. Understanding them is essential for interpreting reasoner output correctly. Reference: OWL 2 Direct Semantics (W3C Rec).

- **Subsumption**: If every instance of class A is necessarily an instance of class B → A is subsumed by B (A is-subclass-of B). The reasoner may derive subsumptions not explicitly declared (inferred hierarchy). If a subsumption appears that the modeler did not intend, the axioms permit an unintended interpretation — revise the axioms, not the reasoner
- **Unsatisfiability**: If the conjunction of a class's necessary conditions is logically impossible → the class is unsatisfiable (equivalent to owl:Nothing, can have no instances). Common causes: conflicting disjointness and subclass declarations, contradictory cardinality restrictions, incompatible domain/range constraints. Unsatisfiability usually indicates a modeling error. Reference: OWL 2 Structural Specification, Section 9.1.3
- **Classification**: The reasoner computes the complete subsumption hierarchy (inferred class hierarchy). The inferred hierarchy may differ from the asserted hierarchy — this is expected. If the inferred hierarchy diverges significantly from intent, the axioms need revision. Classification is the primary reasoning service for TBox verification
- **Instance checking**: Given an instance i and a class C, determine whether i is an instance of C. This may require deriving implicit type assertions through property values, existential restrictions, and other axioms. The result depends on OWA — the reasoner cannot conclude that i is NOT an instance of C merely because rdf:type C is absent
- **Consistency checking**: Determine whether the ontology has at least one possible model (a valid interpretation satisfying all axioms). If inconsistent, the ontology entails everything (ex falso quodlibet) — ALL queries return true, making the ontology useless for reasoning. Inconsistency must be resolved before any other reasoning service produces meaningful results. Reference: OWL 2 Direct Semantics, Section 2.2

## Constraint Conflict Checking

When axioms impose contradictory requirements, the ontology becomes inconsistent or individual classes become unsatisfiable. The following conflict types and resolution mechanisms address the most common patterns.

- **Conflict type 1 — Contradictory axioms on the same class**: Two axioms assert incompatible relationships (e.g., "A rdfs:subClassOf B" + "A owl:disjointWith B"). This means A must be a subset of B AND share no instances with B, which is only satisfiable if A is empty (equivalent to owl:Nothing). Resolution: identify which axiom reflects the intended semantics, remove the other. If both axioms are imported from different ontologies, the import combination is logically invalid — revise the import set or create a bridge ontology that overrides one axiom. Reference: OWL 2 Structural Specification, Section 9.1
- **Conflict type 2 — Cardinality contradiction**: Superclass declares owl:maxCardinality 1 on property P, subclass declares owl:minCardinality 2 on the same property. The subclass constraint is unsatisfiable (requires at least 2 values but inherits a maximum of 1). Resolution: the subclass definition must be revised — either relax the minCardinality or the hierarchy must be restructured so the subclass does not inherit the maxCardinality restriction. Reference: OWL 2 Structural Specification, Section 8.3
- **Conflict type 3 — Domain/range violation**: Property P has rdfs:domain A. An instance of class B (where B owl:disjointWith A) is used as the subject of P → the reasoner infers the instance is of type A AND type B, which contradicts disjointness. Resolution: either the instance's asserted type is wrong, or the property's domain is too narrow, or the disjointness declaration is incorrect. Check which assertion reflects the intended model. Reference: RDFS Semantics, Section 3.2.2
- **Conflict type 4 — Import conflict**: Imported ontology O1 declares "A owl:disjointWith B." Imported ontology O2 declares "C rdfs:subClassOf A" and "C rdfs:subClassOf B." The combined axiom set makes C unsatisfiable. Resolution: O1 and O2 cannot be used together without modification. Options: (a) create a bridge ontology that removes or weakens the disjointness axiom from O1, (b) revise O2 to remove one of C's superclass declarations, (c) do not import both. Cross-reference: dependency_rules.md 'OWL Imports Chain Management'
- When two mapped external ontologies' constraints conflict with each other or with the internal ontology → the mapping itself is a logical error. Review the alignment declarations (owl:equivalentClass, owl:equivalentProperty, skos:exactMatch) for semantic accuracy. Cross-reference: dependency_rules.md 'Alignment vs Integration Dependency Patterns'
- When combining different ontology paradigms (e.g., axiom-based OWL + taxonomy-only SKOS) → verify that the assumptions of each paradigm (OWA vs CWA, open classes vs fixed vocabularies) do not conflict. SKOS concepts are not OWL classes by default; treating them as such requires explicit bridging

## Normative References

The following W3C Recommendations define the normative rules referenced throughout this document. When this document and a W3C specification conflict, the W3C specification takes precedence.

| Specification | Authority | Scope |
|---------------|-----------|-------|
| OWL 2 Web Ontology Language Structural Specification and Functional-Style Syntax (W3C Rec, 2012-12-11) | Normative | Axiom types, class expressions, property expressions |
| OWL 2 Web Ontology Language Direct Semantics (W3C Rec, 2012-12-11) | Normative | Formal semantics for reasoning, entailment |
| OWL 2 Web Ontology Language Profiles (W3C Rec, 2012-12-11) | Normative | EL, QL, RL profile definitions and restrictions |
| OWL 2 Web Ontology Language Primer (W3C Working Group Note, 2012-12-11) | Informative | Explanations, examples, intended usage |
| SHACL — Shapes Constraint Language (W3C Rec, 2017-07-20) | Normative | Data validation, constraint definitions |
| SPARQL 1.1 Query Language (W3C Rec, 2013-03-21) | Normative | Query semantics, negation patterns |
| RDF 1.1 Semantics (W3C Rec, 2014-02-25) | Normative | RDFS entailment, domain/range inference |
| SKOS Simple Knowledge Organization System Reference (W3C Rec, 2009-08-18) | Normative | Concept schemes, semantic relations |

Cross-reference: dependency_rules.md 'Truth Source Hierarchy' for the priority ordering when these sources conflict with other authority levels.

## Related Documents
- concepts.md — definitions of axioms, reasoners, relation types, OWA/CWA, and other terms
- dependency_rules.md — inter-ontology dependencies, import chain management, and mapping rules
- competency_qs.md — Q12~Q15 (constraint/reasoning verification questions)
- structure_spec.md — class hierarchy and namespace rules
- domain_scope.md — scope of this logic's applicability
- extension_cases.md — extension scenarios
- conciseness_rules.md — conciseness rules
