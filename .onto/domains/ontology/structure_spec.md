---
version: 2
last_updated: "2026-03-30"
source: bundled-domain-baseline
status: established
---

# Ontology Domain — Structure Specification

## Ontology Structure Required Elements

- **Namespace**: A URI/IRI space for uniquely identifying entities within the ontology. Prevents conflicts with external ontologies
- **Class Hierarchy**: A tree or DAG structure of classes organized by is-a relations
- **Property Definitions**: Lists of Object Properties and Data Properties, with their respective domains/ranges/characteristics
- **Constraint Declarations**: Formal rules including axioms, cardinality constraints, disjoint declarations, etc.
- **Metadata**: Information about the ontology itself, including creator, version, license, and scope

## Required Relations

- Every class must have at least 1 property or relation (empty classes are prohibited)
- Every property must have its domain and range specified
- Every instance must belong to at least 1 class (rdf:type is required)
- Root classes (excluding owl:Thing) in the class hierarchy must represent the top-level domain concepts of the ontology

## Golden Relationships

Golden relationships are cross-component validation rules. Each rule connects two structural components that must remain consistent with each other. A violation of any golden relationship indicates a structural defect that prevents the ontology from functioning correctly.

- **TBox-ABox consistency**: Every instance's rdf:type must correspond to a class defined in the TBox. If an instance is typed to a class that does not exist in the TBox, reasoners will either raise an error or silently create an unintended class declaration. Verification: for every `?i rdf:type ?C` triple in the ABox, `?C` must appear as an owl:Class or rdfs:Class declaration in the TBox
- **Property-Class coherence**: Every property's rdfs:domain and rdfs:range must reference classes that exist in the ontology. A property whose domain references a non-existent class will apply to all instances (OWL open-world assumption treats unknown classes as equivalent to owl:Thing), producing unintended inferences. Verification: for every rdfs:domain/rdfs:range value, the referenced class must have an explicit declaration
- **Constraint-Instance satisfaction**: Every instance must satisfy all constraints declared on its class and all superclasses (via inheritance). This includes cardinality restrictions (owl:minCardinality, owl:maxCardinality), value restrictions (owl:allValuesFrom, owl:someValuesFrom), and SHACL shapes. Verification: reasoner consistency check + SHACL validation report with zero violations
- **Import-Reference resolution**: All owl:imports URIs must resolve to accessible ontologies. An unresolvable import causes reasoners to either fail or operate on an incomplete axiom set. Verification: HTTP GET (or local file access) on every owl:imports URI must return a valid OWL/RDF document. See also dependency_rules.md ("External Dependency Management")
- **Label-URI consistency**: Every class and property with a URI must have at least one rdfs:label. URIs without labels are inaccessible to human consumers (query builders, ontology editors, documentation generators). Verification: for every owl:Class and owl:ObjectProperty/owl:DatatypeProperty, at least one rdfs:label triple must exist

## Hierarchy Structure Principles

- Superclass (general) -> Subclass (specific): the direction of specialization. Subclasses inherit superclass properties/constraints
- When a subclass redefines (overrides) a superclass property, only constraint tightening is allowed. Constraint relaxation is an is-a violation
- When hierarchy depth is 7 or more, the necessity of intermediate classes should be reviewed. Excessive depth makes navigation and maintenance difficult
- Sibling classes must be distinguished by the same classification criterion

## Classification Criteria Design

- Classification axes (dimensions) must be explicitly declared (e.g., "by type," "by function," "by lifecycle")
- Only a single classification axis is used at the same hierarchy level. If multiple axes are needed, separate into distinct hierarchies or properties
- Both completeness (exhaustive) and exclusiveness (mutually exclusive) of classification must be stated. MECE (Mutually Exclusive, Collectively Exhaustive) is the default, but intentional incompleteness is allowed if stated
- When classification criteria change over time (e.g., technology classification), a change procedure must be defined

## Naming Conventions

- Class names: PascalCase or domain convention. Use singular form (e.g., Person, not Persons)
- Property names: camelCase. Express the direction of the relation (e.g., hasAuthor, isPartOf)
- URI: human-readable form recommended. Meaningless IDs (auto-increment) should be avoided
- Natural language labels (rdfs:label): required for all classes/properties. Use language tags (@ko, @en) for multilingual support

## Modularization Patterns

Modularization is the practice of splitting an ontology into independently loadable units (modules) connected by owl:imports. Proper modularization reduces reasoning time, enables selective reuse, and limits the blast radius of changes.

- **Import chain depth**: Recommend a maximum of 3 levels of transitive imports (A imports B imports C imports D = depth 3). Beyond 3 levels, each import adds accumulated axioms that increase reasoning time and raise the risk of unintended interactions. When depth exceeds 3, consider flattening intermediate modules by merging them into their importers. See also "Quantitative Thresholds" below
- **Module boundary criteria**: Modules should exhibit high internal cohesion (classes and properties within a module are densely interconnected) and low external coupling (few cross-module references). A practical test: if removing a module requires changing more than 20% of the remaining modules' axioms, the boundary is poorly placed
- **Upper ontology pattern**: Domain-independent concepts (e.g., Event, Agent, SpatialRegion) belong in an upper module. Domain-specific concepts (e.g., ClinicalTrial, FinancialInstrument) belong in lower modules that import the upper module. This separation allows multiple domain ontologies to share the same foundational concepts without importing each other
- **Bridge ontology**: When two domain ontologies need alignment (e.g., a medical ontology and a genomics ontology), create a separate bridge module that imports both and declares the alignment mappings (owl:equivalentClass, owl:equivalentProperty, skos:exactMatch). Do not add cross-import statements directly between the domain ontologies, as this creates a circular or tightly coupled dependency. See also dependency_rules.md ("Inter-Ontology Dependencies")

## Quantitative Thresholds

These thresholds are structural health indicators. Exceeding a threshold does not automatically indicate a defect, but requires explicit justification.

| Metric | Threshold | Implication | Action |
|---|---|---|---|
| Hierarchy depth | > 7 levels | Intermediate classes may lack independent justification | Review necessity of each intermediate class (conciseness_rules.md "Minimum Granularity Criteria") |
| Hierarchy breadth | > 30 siblings at same level | Flat structure suggests missing intermediate grouping | Introduce intermediate classes using faceted classification, or document the rationale for flat structure |
| Entity-relation ratio | > 3:1 (classes to object properties) | Structural bias: entities listed without semantic connections | Add relations or remove isolated classes (conciseness_rules.md "Entity-Relation Ratio Imbalance") |
| Orphan rate | > 10% of classes with no relations, no instances, and no subclasses | Significant structural disconnection | Integrate orphans into the relation graph or remove them |
| Module size | > 500 classes per module | Module is too large for efficient reasoning and selective reuse | Split along cohesion boundaries (see "Modularization Patterns" above) |
| Import chain depth | > 3 transitive levels | Accumulated axioms increase reasoning time and unintended interaction risk | Flatten intermediate modules (see "Modularization Patterns" above) |

Cross-reference: The entity-relation ratio threshold (>3:1) is also defined in conciseness_rules.md ("Entity-Relation Ratio Imbalance") as a MUST-REMOVE pattern.

## OWL 2 Profile Selection Criteria

OWL 2 profiles are syntactic subsets of OWL 2 that guarantee tractable reasoning for specific use cases. Selecting a profile is a design decision that constrains the ontology's expressivity in exchange for computational guarantees. The decision should be made early and documented in the ontology metadata.

Decision procedure — start with the simplest profile that meets requirements, upgrade only when expressivity is insufficient:

1. **If the ontology needs large-scale classification with existential restrictions** (e.g., medical terminologies with 100K+ concepts): use **EL**. EL supports conjunction (owl:intersectionOf), existential quantification (owl:someValuesFrom), and limited role inclusions. It does not support negation, disjunction, or universal quantification. Classification in EL is polynomial-time
2. **If the primary use case is SPARQL query answering over large datasets** (e.g., OBDA systems mapping relational databases to RDF): use **QL**. QL supports conjunctive query answering with LogSpace data complexity. It does not support existential quantification on the right side of subclass axioms or role transitivity
3. **If the ontology will be used with rule engines or RDF validation** (e.g., business rules, SHACL-based validation pipelines): use **RL**. RL supports rules expressible as Datalog and is compatible with forward-chaining rule engines. It does not support existential quantification on the right side of subclass axioms
4. **If general-purpose formal reasoning is needed with decidability guarantees** (e.g., formal domain models requiring nominals, qualified cardinality, or role chains): use **DL**. DL supports the full SROIQ(D) Description Logic. Worst-case reasoning complexity is 2NExpTime, but practical performance depends on ontology structure
5. **If none of the above profiles provide sufficient expressivity** (e.g., metamodeling where classes are also instances): use **Full** with explicit documentation that complete reasoning is not possible. This situation is rare and should be justified

Cross-reference: Profile-level expressivity characteristics are summarized in domain_scope.md ("OWL 2 Profile Classification").

## Verification Structure

- Syntactic verification: parsing verification that the ontology file is in valid OWL/RDF format
- Structural verification: detecting structural defects such as empty classes, isolated nodes, and unspecified domain/range
- Logical verification: consistency checking via reasoners, detecting unsatisfiable classes
- Semantic verification: expert review of whether natural language definitions match formal representations. Outside the scope of automation

## Isolated Node Prohibition

- A class not participating in any relation -> warning (isolated class)
- A leaf class with no instances and no subclasses -> warning (unused concept)
- A property not referenced in any domain/range -> warning (unused property)
- An instance not belonging to any class -> warning (unclassified instance)

## Related Documents
- concepts.md — definitions of classes, properties, namespaces, and other terms
- dependency_rules.md — inter-ontology dependencies and mapping-related rules
- competency_qs.md — Q1~Q3 (entity definition), Q8~Q11 (classification consistency questions)
- domain_scope.md — ontology type classification, OWL 2 profile classification, bias detection criteria
- logic_rules.md — constraint conflict checking, reasoning logic
- conciseness_rules.md — entity-relation ratio thresholds, minimum granularity criteria
- extension_cases.md — expansion scenarios
