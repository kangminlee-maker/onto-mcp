---
version: 2
last_updated: "2026-03-30"
source: bundled-domain-baseline
status: established
---

# Ontology Domain — Competency Questions

A list of core questions that this domain's system must be able to answer.
The pragmatics agent verifies the actual reasoning path for each question.

Classification axis: **verification concern** — classified by the concern of questions that must be answered during ontology design review.

Question priority principles: **Structural soundness (entity definition, relation structure, classification consistency) is the highest priority.** These concerns govern the majority of ontology design quality. Constraint verification, interoperability, and pragmatic fitness are secondary concerns applied on top of the structural foundation.

Priority levels:
- **P1** — Must be answerable for any ontology review. Failure indicates a fundamental design defect.
- **P2** — Should be answerable for production ontologies. Failure indicates a quality gap.
- **P3** — Recommended for mature ontologies. Failure indicates a refinement opportunity.

---

## 1. Entity Definition (CQ-E)

Verifies that all classes in the ontology are properly identified, defined, and annotated. Without correct entity definitions, all downstream verification (relations, constraints, classification) is unreliable.

- **CQ-E01** [P1] Can all classes defined in the ontology be enumerated?
  - Inference path: structure_spec.md 'Ontology Structure Required Elements' → Class Hierarchy is a required element → all classes must be listable
  - Verification criteria: PASS if a SPARQL query `SELECT ?c WHERE { ?c a owl:Class }` returns a complete, non-empty result set matching the ontology's declared scope. FAIL if any class is missing from the result or if undeclared classes appear
  - Scope: Covers only explicitly declared classes (owl:Class, rdfs:Class). Does not cover anonymous class expressions (restrictions, intersections) which are verified in CQ-V

- **CQ-E02** [P1] Does each class have a natural language definition (rdfs:label, rdfs:comment)?
  - Inference path: structure_spec.md 'Golden Relationships' → Label-URI consistency → every class and property must have at least one rdfs:label; structure_spec.md 'Naming Conventions' → natural language labels required for all classes/properties
  - Verification criteria: PASS if every owl:Class has at least one rdfs:label and one rdfs:comment triple. FAIL if any class lacks either. WARNING if language tags (@en, @ko) are absent
  - Scope: Covers rdfs:label and rdfs:comment. SKOS labels (skos:prefLabel, skos:altLabel) are checked separately in CQ-I

- **CQ-E03** [P1] Is the entity's unique identifier system (URI/IRI) applied consistently?
  - Inference path: structure_spec.md 'Naming Conventions' → URI human-readable form recommended; logic_rules.md 'Naming Logic' → one URI must identify exactly one concept (URI uniqueness principle)
  - Verification criteria: PASS if all URIs follow a consistent namespace pattern, no duplicate URIs exist for distinct concepts, and no blank nodes are used where named resources are required. FAIL if URI patterns are inconsistent or if owl:sameAs declarations reveal unintended duplicates
  - Scope: Covers URI structure and uniqueness. Does not cover URI dereferenceability (checked in CQ-I04)

- **CQ-E04** [P2] Are there classes with only a name but no properties, constraints, or relations (empty shell classes)?
  - Inference path: structure_spec.md 'Required Relations' → every class must have at least 1 property or relation (empty classes are prohibited); structure_spec.md 'Isolated Node Prohibition' → class not participating in any relation triggers warning
  - Verification criteria: PASS if every class participates in at least one property declaration (as domain or range), has at least one restriction, or has at least one subclass. FAIL if any class has only rdfs:label/rdfs:comment and no structural participation
  - Scope: Covers structural participation. A class with only annotation properties and no logical role is considered empty

- **CQ-E05** [P2] Is the distinction between defined concepts and primitive concepts (those with necessary and sufficient conditions vs. only necessary conditions) explicitly documented?
  - Inference path: concepts.md 'Ontology Engineering Methodology Terms' → Competency Questions; domain_scope.md 'Entity Definition' → SNOMED CT distinguishes defining concepts from primitive concepts; logic_rules.md 'Description Logic Inference Patterns' → Classification → reasoner computes inferred hierarchy based on necessary and sufficient conditions
  - Verification criteria: PASS if each class is annotated (rdfs:comment or custom annotation) indicating whether it is defined (owl:equivalentClass with complete conditions) or primitive (only rdfs:subClassOf with necessary conditions). FAIL if the distinction is absent and the ontology contains both types without documentation
  - Scope: Relevant for ontologies using OWL DL or EL profiles where classification relies on this distinction. Not applicable to RDFS-only ontologies

- **CQ-E06** [P2] Are abstract classes (classes intended to have only subclasses, never direct instances) explicitly declared?
  - Inference path: structure_spec.md 'Hierarchy Structure Principles' → superclass-subclass specialization direction; concepts.md 'Interpretation Principles' → "A class exists" and "a class is correctly defined" are not the same
  - Verification criteria: PASS if abstract classes are annotated (e.g., custom annotation `isAbstract "true"` or rdfs:comment stating "abstract — no direct instances expected"). FAIL if the ontology has classes that function as abstract (only have subclasses, no instances) but this is not documented

- **CQ-E07** [P3] When a class represents a real-world entity type, is the identity criterion (what makes two instances the "same") specified?
  - Inference path: logic_rules.md 'Naming Logic' → if two URIs refer to the same concept, declare owl:sameAs; concepts.md 'Relation Type Terms' → equivalent-to = two classes or properties are semantically identical
  - Verification criteria: PASS if classes representing real-world entities include documentation of identity criteria (e.g., "two Person instances are the same if they share the same national ID number"). FAIL if no identity criterion exists for key entity classes

- **CQ-E08** [P3] Are annotation properties (rdfs:comment, rdfs:seeAlso, owl:versionInfo, etc.) used consistently across all entities?
  - Inference path: structure_spec.md 'Golden Relationships' → Label-URI consistency; concepts.md 'Homonyms Requiring Attention' → "annotation" has different meanings across contexts
  - Verification criteria: PASS if the same set of annotation properties is applied uniformly to all classes and properties (e.g., all have rdfs:label, rdfs:comment, and rdfs:isDefinedBy). FAIL if annotation usage is inconsistent (some classes fully annotated, others bare)

---

## 2. Relation Structure (CQ-R)

Verifies that properties (relations) between classes are correctly declared with domain, range, logical characteristics, and structural integrity.

- **CQ-R01** [P1] Can we derive what relations exist between two classes?
  - Inference path: structure_spec.md 'Property Definitions' → lists of Object Properties and Data Properties with domains/ranges/characteristics; dependency_rules.md 'Inter-Property Dependencies' → property dependency graph
  - Verification criteria: PASS if, for any pair of classes, the set of connecting properties can be queried (directly or via property chains). FAIL if relations exist only implicitly (e.g., inferred through instances but never declared at the TBox level)

- **CQ-R02** [P1] Are the domain and range of relations specified?
  - Inference path: structure_spec.md 'Required Relations' → every property must have its domain and range specified; structure_spec.md 'Golden Relationships' → Property-Class coherence → domain and range must reference existing classes
  - Verification criteria: PASS if every owl:ObjectProperty and owl:DatatypeProperty has explicit rdfs:domain and rdfs:range declarations. FAIL if any property lacks either declaration
  - Scope: Covers explicit declarations. Does not evaluate whether domain/range choices are semantically appropriate (that is CQ-V04)

- **CQ-R03** [P1] Are the directionality and inverse relations defined?
  - Inference path: dependency_rules.md 'Inter-Property Dependencies' → inverse relations → changing one side's domain/range must be reflected in the other; logic_rules.md 'Reasoning Logic' → symmetry declarations
  - Verification criteria: PASS if every Object Property has documented directionality and, where applicable, an owl:inverseOf declaration. FAIL if directional relations lack inverse declarations when the inverse is semantically meaningful

- **CQ-R04** [P1] Are the logical characteristics of relations (transitive, symmetric, etc.) declared?
  - Inference path: logic_rules.md 'Reasoning Logic' → transitivity, symmetry, asymmetry declarations; concepts.md 'Relation Type Terms' → each relation type specifies its logical properties
  - Verification criteria: PASS if properties that are transitive, symmetric, asymmetric, reflexive, irreflexive, or functional have the corresponding OWL declarations. FAIL if a property that should be transitive (e.g., part-of in appropriate contexts) lacks the declaration

- **CQ-R05** [P2] Are property chains declared and validated against actual relation paths?
  - Inference path: dependency_rules.md 'Inter-Property Dependencies' → property chains (owl:propertyChainAxiom) → chain depends on each constituent property; logic_rules.md 'Reasoning Logic' → selective transitivity via property chains
  - Verification criteria: PASS if declared property chains produce correct inferences when tested with sample instances. FAIL if a chain produces unintended inferences or if a chain's constituent properties have incompatible domain/range declarations

- **CQ-R06** [P2] When sub-properties are defined, do instances of the sub-property automatically satisfy the super-property's constraints?
  - Inference path: dependency_rules.md 'Inter-Property Dependencies' → sub-properties (rdfs:subPropertyOf) → sub-property's domain must be subclass of super-property's domain; logic_rules.md 'Classification Logic' → constraint inheritance
  - Verification criteria: PASS if every sub-property's domain is a subclass of (or equal to) its super-property's domain, and similarly for range. FAIL if a sub-property violates the super-property's domain/range constraints

- **CQ-R07** [P2] Are inverse functional properties (properties that uniquely identify instances) correctly declared?
  - Inference path: logic_rules.md 'Naming Logic' → URI uniqueness principle; concepts.md 'Description Logic Terms' → SHOIN(D) includes functionality
  - Verification criteria: PASS if properties intended to uniquely identify instances (e.g., socialSecurityNumber) are declared owl:InverseFunctionalProperty. FAIL if such properties lack the declaration, allowing the reasoner to miss identity inferences

- **CQ-R08** [P2] When the same semantic relation is represented by different properties in different modules, are they aligned via owl:equivalentProperty?
  - Inference path: dependency_rules.md 'Alignment vs Integration Dependency Patterns' → mapping declares correspondence without axiom integration; logic_rules.md 'Naming Logic' → if two URIs refer to the same concept, declare equivalence
  - Verification criteria: PASS if cross-module property duplicates are connected via owl:equivalentProperty or documented as intentionally distinct. FAIL if semantically identical properties in different modules are unconnected

- **CQ-R09** [P2] Is the distinction between Object Properties and Data Properties consistently applied?
  - Inference path: concepts.md 'Basic Component Terms' → Property divided into Object Property (relations between entities) and Data Property (data values); concepts.md 'Homonyms Requiring Attention' → "property" has multiple meanings
  - Verification criteria: PASS if no Object Property has a literal as its range and no Data Property has a class as its range. FAIL if property type declarations are inconsistent with actual usage

- **CQ-R10** [P2] Are reflexive, irreflexive, symmetric, asymmetric declarations consistent (no contradictions)?
  - Inference path: logic_rules.md 'Reasoning Logic' → a property cannot be both symmetric and asymmetric; logic_rules.md 'Constraint Conflict Checking' → contradictory axioms
  - Verification criteria: PASS if no property is simultaneously declared with contradictory characteristics (symmetric + asymmetric, reflexive + irreflexive). FAIL if any such contradiction exists. The reasoner may not always catch this depending on the profile

---

## 3. Classification Consistency (CQ-C)

Verifies that the class hierarchy is well-formed, uses consistent classification criteria, and maintains structural integrity.

- **CQ-C01** [P1] Are the classification criteria (axes) stated, and is a single criterion used within the same hierarchy level?
  - Inference path: structure_spec.md 'Classification Criteria Design' → only a single classification axis at the same hierarchy level; logic_rules.md 'Classification Logic' → cross-classification if sibling classes use different criteria
  - Verification criteria: PASS if each hierarchy level's classification axis is documented (e.g., "by function," "by type") and siblings at the same level share the same axis. FAIL if siblings use mixed criteria without documentation
  - Scope: Covers declared hierarchies. Does not cover inferred hierarchies produced by the reasoner

- **CQ-C02** [P1] Do subclasses satisfy all characteristics of their superclass (is-a justification)?
  - Inference path: structure_spec.md 'Hierarchy Structure Principles' → subclasses inherit superclass properties/constraints; logic_rules.md 'Classification Logic' → if B rdfs:subClassOf A and A has restriction, B inherits it; constraint relaxation is an is-a violation
  - Verification criteria: PASS if every subclass satisfies all inherited restrictions from its superclass chain. FAIL if any subclass redefines a superclass restriction in a way that relaxes it (e.g., reducing minCardinality)

- **CQ-C03** [P1] Are classes that should be mutually exclusive declared as disjoint?
  - Inference path: logic_rules.md 'Classification Logic' → owl:disjointWith and owl:disjointUnionOf semantics; concepts.md 'Relation Type Terms' → disjoint-with = two classes cannot have common instances
  - Verification criteria: PASS if all class pairs that are conceptually mutually exclusive have owl:disjointWith declarations. FAIL if conceptually disjoint classes lack disjointness declarations, allowing instances to belong to both
  - Scope: Covers explicit disjointness. Implicit disjointness (derivable from other axioms) is acceptable if the reasoner can derive it

- **CQ-C04** [P1] Is the classification system exhaustive (does every instance of a superclass belong to one of its subclasses)?
  - Inference path: logic_rules.md 'Classification Logic' → owl:disjointUnionOf requires subclasses to be pairwise disjoint AND their union equivalent to the superclass; structure_spec.md 'Classification Criteria Design' → MECE status must be stated
  - Verification criteria: PASS if exhaustiveness is either (a) declared via owl:disjointUnionOf or (b) explicitly documented as intentionally non-exhaustive. FAIL if exhaustiveness status is unstated and instances could fall outside all subclasses

- **CQ-C05** [P2] When multiple inheritance is used, is the diamond problem addressed for conflicting inherited properties?
  - Inference path: logic_rules.md 'Classification Logic' → diamond inheritance conflict → D must explicitly declare its own restriction consistent with both inherited restrictions
  - Verification criteria: PASS if every class with multiple superclasses that define restrictions on the same property explicitly resolves the conflict. FAIL if conflicting inherited restrictions are left unresolved

- **CQ-C06** [P2] Is the classification criterion (axis) documented at each hierarchy level?
  - Inference path: structure_spec.md 'Classification Criteria Design' → classification axes must be explicitly declared; domain_scope.md 'Classification System' → axis assignment per level
  - Verification criteria: PASS if every non-leaf level in the hierarchy has a documented classification axis. FAIL if any intermediate level lacks axis documentation

- **CQ-C07** [P2] Are Disjoint Union declarations complete (if subclasses are meant to be exhaustive, is it declared)?
  - Inference path: logic_rules.md 'Classification Logic' → if only pairwise disjointness is declared without equivalence of union, the partition is incomplete
  - Verification criteria: PASS if every set of subclasses intended to exhaustively partition a superclass is declared via owl:disjointUnionOf. FAIL if only owl:disjointWith is used when exhaustiveness is intended

- **CQ-C08** [P2] When a class appears in multiple hierarchies (polyhierarchy), is the justification for each parent documented?
  - Inference path: structure_spec.md 'Hierarchy Structure Principles' → Class Hierarchy is a DAG structure; domain_scope.md 'Classification System' → multiple inheritance allowed if documented
  - Verification criteria: PASS if every class with multiple superclasses has documentation justifying each parent relationship. FAIL if polyhierarchy exists without justification

- **CQ-C09** [P3] Is the depth of the classification hierarchy proportional to the domain's actual complexity (detecting over-classification)?
  - Inference path: structure_spec.md 'Quantitative Thresholds' → hierarchy depth > 7 levels requires review; structure_spec.md 'Hierarchy Structure Principles' → excessive depth makes navigation and maintenance difficult
  - Verification criteria: PASS if hierarchy depth is ≤ 7 or, if deeper, each intermediate class has independent justification. FAIL if intermediate classes exist solely as placeholders without distinct semantics

- **CQ-C10** [P3] When enumeration classes (owl:oneOf) are used, is the enumeration complete and maintained?
  - Inference path: logic_rules.md 'Constraint Logic' → enumeration without Closure Axiom allows additional values under OWA; concepts.md 'Constraint-Related Terms' → Closure Axiom definition
  - Verification criteria: PASS if every owl:oneOf enumeration is accompanied by a Closure Axiom (owl:allValuesFrom) when completeness is intended, and a maintenance process for updating enumerations is documented. FAIL if enumerations are used without closure axioms and completeness is assumed

---

## 4. Constraint Verification (CQ-V)

Verifies that formal constraints (axioms, restrictions, SHACL shapes) are correctly defined, satisfiable, and consistent with each other.

- **CQ-V01** [P1] When required properties (minimum cardinality >= 1) are defined, do instances satisfy them?
  - Inference path: structure_spec.md 'Golden Relationships' → Constraint-Instance satisfaction → every instance must satisfy all constraints; logic_rules.md 'Constraint Logic' → OWA means absence is "unknown" not "false"
  - Verification criteria: PASS if SHACL validation (CWA) confirms all instances satisfy minCardinality constraints. Under OWL (OWA), PASS if no inconsistency is detected. FAIL if SHACL reports violations or if the reasoner detects inconsistency
  - Scope: Covers instance-level satisfaction. TBox-level satisfiability of the constraints themselves is checked in CQ-V05

- **CQ-V02** [P1] Are there no instances violating mutual exclusivity constraints (disjoint)?
  - Inference path: logic_rules.md 'Constraint Conflict Checking' → Conflict type 1 (contradictory axioms); logic_rules.md 'Description Logic Inference Patterns' → Consistency checking
  - Verification criteria: PASS if no instance has rdf:type assertions for two disjoint classes. FAIL if any instance belongs to two classes declared owl:disjointWith

- **CQ-V03** [P1] When domain/range constraints are declared, do actual instances comply?
  - Inference path: logic_rules.md 'Constraint Logic' → domain/range is classification (inference), not validation (rejection); logic_rules.md 'Constraint Conflict Checking' → Conflict type 3 (domain/range violation)
  - Verification criteria: PASS if all property assertions use subjects and objects consistent with declared domain/range, or if the reasoner's inferred types are intentional. FAIL if domain/range inference produces unintended type assertions (e.g., an instance inferred as type A when it should be type B)
  - Scope: Covers both intended and unintended inferences. SHACL sh:class validation provides the CWA complement

- **CQ-V04** [P1] Is consistency maintained when a reasoner is executed?
  - Inference path: logic_rules.md 'Description Logic Inference Patterns' → Consistency checking → if inconsistent, ontology entails everything; logic_rules.md 'Reasoning Logic' → isolate axioms to minimal unsatisfiable subset
  - Verification criteria: PASS if HermiT, Pellet, or equivalent reasoner reports "consistent" with zero unsatisfiable classes. FAIL if any class is equivalent to owl:Nothing or the ontology is inconsistent

- **CQ-V05** [P2] Are there unsatisfiable classes (classes that cannot have any instances due to contradictory constraints)?
  - Inference path: logic_rules.md 'Constraint Logic' → minCardinality N > maxCardinality M makes class unsatisfiable; logic_rules.md 'Description Logic Inference Patterns' → Unsatisfiability common causes
  - Verification criteria: PASS if the reasoner reports zero unsatisfiable classes (excluding owl:Nothing). FAIL if any named class is classified as equivalent to owl:Nothing

- **CQ-V06** [P2] When SHACL shapes are defined alongside OWL axioms, are the constraints consistent (CWA vs OWA)?
  - Inference path: logic_rules.md 'SHACL Validation Logic' → SHACL operates under CWA, OWL under OWA; logic_rules.md 'Open World vs Closed World Reasoning' → resolution pattern: use OWL for TBox, SHACL for ABox
  - Verification criteria: PASS if documented analysis confirms that SHACL shapes and OWL axioms do not produce contradictory results for any instance, or if discrepancies are documented with rationale. FAIL if SHACL reports violations that OWL reasoning considers consistent, and the discrepancy is not documented

- **CQ-V07** [P2] Can the reasoner classify the ontology without running out of memory within the declared OWL 2 profile?
  - Inference path: logic_rules.md 'OWL 2 Profile Expressivity Rules' → profile determines computational complexity; structure_spec.md 'OWL 2 Profile Selection Criteria' → EL is polynomial, DL is 2NExpTime worst-case
  - Verification criteria: PASS if classification completes within a reasonable time (project-defined threshold, e.g., 60 seconds) and memory limit (e.g., 4GB heap). FAIL if the reasoner times out or runs out of memory

- **CQ-V08** [P2] When value restrictions (allValuesFrom, someValuesFrom) are used, do they interact correctly with existing subclass declarations?
  - Inference path: logic_rules.md 'Classification Logic' → constraint inheritance through subclass chain; logic_rules.md 'Constraint Conflict Checking' → Conflict type 2 (cardinality contradiction)
  - Verification criteria: PASS if value restrictions on superclasses are compatible with restrictions on subclasses (subclass restrictions are equal or more specific). FAIL if a subclass's restriction widens or contradicts a superclass's restriction

- **CQ-V09** [P2] Are closure axioms used where the Closed World Assumption is needed?
  - Inference path: logic_rules.md 'Constraint Logic' → enumeration without Closure Axiom allows additional values under OWA; logic_rules.md 'Open World vs Closed World Reasoning' → application requires negation-as-failure
  - Verification criteria: PASS if every class where "only these values" semantics are intended has an owl:allValuesFrom restriction alongside the enumeration or someValuesFrom. FAIL if CWA semantics are assumed but no closure axiom is present

- **CQ-V10** [P3] When number restrictions (minCardinality, maxCardinality) are combined with property type declarations, is the combination satisfiable?
  - Inference path: logic_rules.md 'Constraint Logic' → N > M makes class unsatisfiable; logic_rules.md 'OWL 2 Profile Expressivity Rules' → DL profile: non-simple roles in cardinality restrictions require role regularity constraints
  - Verification criteria: PASS if all cardinality combinations are satisfiable and no cardinality restriction applies to a non-simple role in a profile that prohibits it. FAIL if cardinality restrictions create unsatisfiable classes or violate profile constraints

---

## 5. Scope and Purpose (CQ-S)

Verifies that the ontology's intended scope, purpose, target consumers, and competency boundaries are explicitly defined and consistently maintained.

- **CQ-S01** [P1] Is the ontology's scope explicitly stated?
  - Inference path: domain_scope.md entire document → scope definition is the reference for coverage verification; concepts.md 'Interpretation Principles' → "An ontology without scope cannot be completed"
  - Verification criteria: PASS if the ontology metadata or documentation contains an explicit scope statement defining what the ontology covers. FAIL if no scope statement exists
  - Scope: Covers the existence of a scope declaration. Whether the ontology conforms to its declared scope is checked in CQ-S02 and CQ-S03

- **CQ-S02** [P1] Are no out-of-scope concepts included (over-design detection)?
  - Inference path: domain_scope.md 'Bias Detection Criteria' → scope creep; structure_spec.md 'Quantitative Thresholds' → orphan rate > 10% indicates disconnection
  - Verification criteria: PASS if every class and property can be traced to the declared scope. FAIL if classes or properties exist that fall outside the declared scope without documented justification

- **CQ-S03** [P1] Are no core in-scope concepts missing (under-design detection)?
  - Inference path: domain_scope.md 'Required Concept Categories' → entity identity, relation typing, constraint declaration, etc. must be addressed; domain_scope.md 'Bias Detection Criteria' → vertical bias
  - Verification criteria: PASS if all required concept categories from domain_scope.md are represented in the ontology. FAIL if any required category is entirely absent

- **CQ-S04** [P2] Are the competency questions (the questions the ontology must answer) explicitly documented?
  - Inference path: concepts.md 'Ontology Engineering Methodology Terms' → Competency Questions are the primary requirements specification method; domain_scope.md 'Required Concept Categories' → Competency scope must be explicitly enumerated
  - Verification criteria: PASS if the ontology includes a documented set of competency questions. FAIL if no competency questions are defined (the ontology has no testable requirements)

- **CQ-S05** [P2] Is the intended OWL 2 profile explicitly stated and justified?
  - Inference path: structure_spec.md 'OWL 2 Profile Selection Criteria' → decision procedure from simplest to most expressive; logic_rules.md 'OWL 2 Profile Expressivity Rules' → profile determines what constructs are allowed; domain_scope.md 'OWL 2 Profile Classification' → profile table
  - Verification criteria: PASS if the ontology metadata declares an OWL 2 profile with justification for the choice. FAIL if no profile is declared or if the ontology uses constructs outside its declared profile

- **CQ-S06** [P2] Are the target consumers (human, reasoner, query engine, application) identified?
  - Inference path: domain_scope.md 'Bias Detection Criteria' → missing consumer perspective (machine bias) and single-standard dependency; concepts.md 'Interpretation Principles' → formal representations and natural language definitions require separate verification
  - Verification criteria: PASS if the ontology documentation identifies its target consumers and the expected consumption methods (SPARQL queries, reasoner classification, visualization, application API). FAIL if no consumer identification exists

- **CQ-S07** [P2] Is the boundary between in-scope and out-of-scope concepts explicitly drawn?
  - Inference path: domain_scope.md 'Bias Detection Criteria' → scope creep; domain_scope.md 'Required Concept Categories' → Application context must include explicit statement of purpose and scope
  - Verification criteria: PASS if the ontology documentation includes explicit boundary statements (e.g., "This ontology covers X but does NOT cover Y"). FAIL if only in-scope concepts are listed without boundary definition

- **CQ-S08** [P3] When the ontology serves multiple purposes (reasoning + querying + visualization), are the different requirements documented?
  - Inference path: domain_scope.md 'Bias Detection Criteria' → single-standard dependency; concepts.md 'Interpretation Principles' → SKOS and OWL serve different purposes on the same data
  - Verification criteria: PASS if multi-purpose ontologies document the requirements and trade-offs for each purpose. FAIL if the ontology serves multiple purposes but only documents one

---

## 6. Interoperability (CQ-I)

Verifies that the ontology can interact correctly with external ontologies, standard vocabularies, and consuming systems.

- **CQ-I01** [P1] When mapping/alignment with external ontologies is needed, are the correspondence relations specified?
  - Inference path: dependency_rules.md 'Alignment vs Integration Dependency Patterns' → mapping declares correspondence without axiom integration; dependency_rules.md 'Referential Integrity' → external concepts referenced in mappings must exist in target ontology
  - Verification criteria: PASS if all external alignments use explicit correspondence relations (owl:equivalentClass, owl:equivalentProperty, skos:exactMatch, skos:broadMatch, skos:narrowMatch) with the alignment type documented. FAIL if external references exist without correspondence declarations

- **CQ-I02** [P1] Are standard vocabularies (Dublin Core, SKOS, etc.) reused, or are they unnecessarily redefined?
  - Inference path: dependency_rules.md 'Source of Truth Management' → standards are source of truth for reused terms, semantics must not be redefined; domain_scope.md 'Reference Standards/Frameworks' → standard vocabulary list
  - Verification criteria: PASS if the ontology reuses standard vocabulary terms where applicable (e.g., dct:creator instead of a custom :creator property). FAIL if the ontology redefines standard terms with different semantics

- **CQ-I03** [P2] When owl:imports is used, is the import chain depth within the recommended limit?
  - Inference path: structure_spec.md 'Modularization Patterns' → import chain depth max 3 levels recommended; dependency_rules.md 'OWL Imports Chain Management' → transitivity of imports, depth tracking
  - Verification criteria: PASS if import chain depth is ≤ 3. WARNING if depth is 4. FAIL if depth > 4 without documented justification and performance verification

- **CQ-I04** [P2] Are namespace prefixes consistent and do they resolve to accessible URIs?
  - Inference path: structure_spec.md 'Ontology Structure Required Elements' → Namespace is a required element; dependency_rules.md 'OWL Imports Chain Management' → import failure handling
  - Verification criteria: PASS if all namespace URIs are dereferenceable (HTTP GET returns a valid response) or explicitly documented as non-dereferenceable. FAIL if namespace URIs return 404 or connection errors without documentation

- **CQ-I05** [P2] When aligning with an external ontology, is the alignment type specified (equivalence/subsumption/overlap/disjoint)?
  - Inference path: dependency_rules.md 'Alignment vs Integration Dependency Patterns' → mapping types; concepts.md 'Ontology Design Terms' → Ontology Alignment definition
  - Verification criteria: PASS if every alignment declaration specifies the correspondence type (exact match, broad match, narrow match, related match). FAIL if alignments exist without type specification

- **CQ-I06** [P2] Is the ontology serializable in multiple formats (RDF/XML, Turtle, JSON-LD) without information loss?
  - Inference path: structure_spec.md 'Verification Structure' → syntactic verification (parsing); concepts.md 'Normative System Classification' → RDF is the data model layer
  - Verification criteria: PASS if round-trip serialization tests (RDF/XML → Turtle → RDF/XML) produce equivalent graphs. FAIL if any serialization format loses axioms or annotations

- **CQ-I07** [P3] When the ontology is used in a SPARQL endpoint, can the competency questions be translated to executable SPARQL queries?
  - Inference path: concepts.md 'Ontology Engineering Methodology Terms' → a competency question that cannot be expressed as SPARQL indicates a modeling gap; domain_scope.md 'Required Concept Categories' → Query Interface
  - Verification criteria: PASS if each documented competency question has a corresponding executable SPARQL query. FAIL if any competency question cannot be translated to SPARQL

- **CQ-I08** [P3] Are deprecated external concepts (from imported ontologies) detected and replaced?
  - Inference path: dependency_rules.md 'Referential Integrity' → deprecated concepts still referenced must be identified; dependency_rules.md 'External Dependency Management' → deprecation response plan
  - Verification criteria: PASS if no imported concept marked owl:deprecated is referenced by the ontology. FAIL if deprecated external concepts are in active use without a migration plan

---

## 7. Change Readiness (CQ-CR)

Verifies that the ontology can evolve safely through versioning, deprecation, modularization, and impact analysis.

- **CQ-CR01** [P1] When adding new classes/properties, can pre-verification be performed to ensure no conflict with existing constraints?
  - Inference path: logic_rules.md 'Constraint Conflict Checking' → all 4 conflict types; dependency_rules.md 'Version Dependency Management' → backward compatibility rules
  - Verification criteria: PASS if a documented process exists for running reasoner consistency checking after additions, and the addition workflow includes constraint verification. FAIL if additions are made without any pre-verification step

- **CQ-CR02** [P1] Are replacement paths specified for deprecated concepts?
  - Inference path: dependency_rules.md 'Version Dependency Management' → deprecation protocol: (1) add owl:deprecated, (2) add rdfs:comment with replacement, (3) retain for one version cycle, (4) remove in next major version
  - Verification criteria: PASS if every concept marked owl:deprecated has a documented replacement (rdfs:comment or custom annotation pointing to the successor). FAIL if deprecated concepts lack replacement guidance

- **CQ-CR03** [P1] Has backward compatibility been assessed for version changes?
  - Inference path: dependency_rules.md 'Version Dependency Management' → backward compatibility rules → adding is compatible, removing is breaking, changing domain/range is potentially breaking
  - Verification criteria: PASS if each version change is categorized as backward-compatible or breaking, with migration guidance for breaking changes. FAIL if version changes are undocumented or uncategorized

- **CQ-CR04** [P2] Is there a deprecation protocol for retiring concepts?
  - Inference path: dependency_rules.md 'Version Dependency Management' → 4-step deprecation protocol; dependency_rules.md 'Referential Integrity' → deprecated concepts still referenced must be tracked
  - Verification criteria: PASS if the ontology documents a deprecation protocol that includes timeline, replacement identification, and consumer notification. FAIL if concepts are removed without a deprecation phase

- **CQ-CR05** [P2] When a class is removed, is the impact on existing instances, subclasses, and properties fully traced?
  - Inference path: dependency_rules.md 'Direction Rules' → deleting domain class invalidates property, deleting class leaves instance unclassified; dependency_rules.md 'Referential Integrity' → referential integrity violations
  - Verification criteria: PASS if a documented impact analysis traces all references to the removed class (subclasses, properties using it as domain/range, instances). FAIL if removal occurs without impact analysis

- **CQ-CR06** [P2] Can the ontology be modularized so that changes to one module don't affect others?
  - Inference path: structure_spec.md 'Modularization Patterns' → high internal cohesion, low external coupling; structure_spec.md 'Modularization Patterns' → module boundary criteria (removing a module should require changing ≤ 20% of remaining modules)
  - Verification criteria: PASS if the ontology is divided into modules where changes to one module do not require changes to more than 20% of other modules' axioms. FAIL if the ontology is monolithic or if module boundaries are poorly placed (high coupling)

- **CQ-CR07** [P2] Is there a version URI distinct from the ontology IRI?
  - Inference path: dependency_rules.md 'Version Dependency Management' → ontology IRI vs version IRI; dependency_rules.md 'OWL Imports Chain Management' → version pinning
  - Verification criteria: PASS if the ontology declares both an ontology IRI and a distinct version IRI (owl:versionIRI). FAIL if only the ontology IRI exists, making version-specific imports impossible

- **CQ-CR08** [P3] When a breaking change is introduced, is there a migration path for existing data?
  - Inference path: dependency_rules.md 'Version Dependency Management' → backward compatibility rules → removing or renaming is a breaking change; concepts.md 'Version Management Terms' → Breaking Change definition
  - Verification criteria: PASS if breaking changes include documented migration instructions (e.g., SPARQL UPDATE scripts, mapping from old to new terms). FAIL if breaking changes have no migration guidance

---

## 8. Pragmatic Fitness (CQ-P)

Verifies that the ontology is usable in practice — it can answer queries, support applications, and be understood by its intended audience.

- **CQ-P01** [P1] Can the ontology actually execute the queries it targets?
  - Inference path: concepts.md 'Ontology Engineering Methodology Terms' → competency questions translatable to SPARQL; domain_scope.md 'Required Concept Categories' → Competency scope
  - Verification criteria: PASS if sample SPARQL queries for each competency question return correct, non-empty results against test data. FAIL if queries return incorrect or empty results due to modeling gaps

- **CQ-P02** [P1] Does the reasoner return results within a reasonable time (computational complexity)?
  - Inference path: logic_rules.md 'OWL 2 Profile Expressivity Rules' → profile determines complexity; concepts.md 'Description Logic Terms' → computational complexity classes
  - Verification criteria: PASS if all standard reasoning tasks (consistency, classification, instance checking) complete within the project-defined time threshold (e.g., 60 seconds for classification). FAIL if any reasoning task exceeds the threshold

- **CQ-P03** [P2] Can the ontology support the full CRUD lifecycle (Create, Read, Update, Delete) for instances?
  - Inference path: structure_spec.md 'Golden Relationships' → TBox-ABox consistency, Constraint-Instance satisfaction; dependency_rules.md 'Source of Truth Management' → TBox is source of truth, ABox must conform
  - Verification criteria: PASS if instances can be created (conforming to TBox constraints), queried (via SPARQL), updated (without breaking consistency), and deleted (with referential integrity maintained). FAIL if any CRUD operation produces inconsistency or referential integrity violations

- **CQ-P04** [P2] When used in an application, does the ontology's granularity match the application's needs?
  - Inference path: structure_spec.md 'Quantitative Thresholds' → hierarchy depth, breadth, entity-relation ratio thresholds; domain_scope.md 'Bias Detection Criteria' → over-classification, classification bias
  - Verification criteria: PASS if the ontology's class granularity aligns with the application's data granularity (no classes that are too abstract to instantiate, no classes that are too specific to be useful). FAIL if application developers report persistent granularity mismatches

- **CQ-P05** [P2] Are there performance bottlenecks from complex property chains or transitive closures?
  - Inference path: logic_rules.md 'Reasoning Logic' → transitivity chains; dependency_rules.md 'Inter-Property Dependencies' → property chains depend on constituent properties; structure_spec.md 'Quantitative Thresholds' → module size > 500 classes
  - Verification criteria: PASS if property chain reasoning and transitive closure computation complete within the time threshold. FAIL if specific chains or transitive properties cause reasoning timeouts

- **CQ-P06** [P2] Is the ontology usable without a reasoner (can SPARQL queries alone answer core questions)?
  - Inference path: concepts.md 'Interpretation Principles' → SPARQL FILTER NOT EXISTS operates under CWA; logic_rules.md 'Open World vs Closed World Reasoning' → SPARQL semantic differences from OWL
  - Verification criteria: PASS if the ontology's core competency questions can be answered by SPARQL queries without requiring reasoner-derived inferences. FAIL if answering core questions requires inferred triples that are not materialized in the dataset

- **CQ-P07** [P3] Can the ontology be visualized in a comprehensible graph at different zoom levels?
  - Inference path: domain_scope.md 'Major Sub-areas' → Visualization (scale-dependent); structure_spec.md 'Quantitative Thresholds' → hierarchy breadth > 30 siblings suggests missing grouping
  - Verification criteria: PASS if the ontology can be rendered in a graph visualization tool (e.g., WebVOWL, Protege OntoGraf) at overview level (top classes), mid-level (specific branches), and detail level (individual classes with properties) without visual overload. FAIL if visualization at any level produces an incomprehensible graph

- **CQ-P08** [P3] Is the documentation sufficient for a new user to understand and use the ontology correctly?
  - Inference path: structure_spec.md 'Golden Relationships' → Label-URI consistency; concepts.md 'Ontology Engineering Methodology Terms' → Ontology Evaluation includes usability (documentation, naming conventions, tool compatibility)
  - Verification criteria: PASS if a new user (with domain knowledge but no prior exposure to this ontology) can correctly instantiate a class and query for it using only the ontology's documentation. FAIL if the documentation is insufficient for correct independent use

---

## 9. Edge Cases (CQ-X)

Tests boundary conditions and failure modes that are not covered by the standard verification concerns above. These questions verify resilience — what happens when things go wrong.

- **CQ-X01** [P2] What happens when an instance belongs to two disjoint classes? Does the reasoner catch this?
  - Inference path: logic_rules.md 'Constraint Conflict Checking' → Conflict type 1 (contradictory axioms); logic_rules.md 'Description Logic Inference Patterns' → Consistency checking detects disjointness violations
  - Verification criteria: PASS if inserting a test instance with rdf:type for two disjoint classes causes the reasoner to report inconsistency. FAIL if the reasoner does not detect the violation (may indicate missing disjointness axioms or profile limitations)

- **CQ-X02** [P2] What happens when an imported ontology is updated and breaks internal constraints?
  - Inference path: dependency_rules.md 'OWL Imports Chain Management' → version pinning requirement; dependency_rules.md 'Version Dependency Management' → external standard versioning impact assessment; logic_rules.md 'Constraint Conflict Checking' → Conflict type 4 (import conflict)
  - Verification criteria: PASS if (a) imports use version-pinned URIs preventing silent updates, or (b) a documented process exists to re-run consistency checking after external ontology updates. FAIL if imports reference unversioned URIs with no update monitoring

- **CQ-X03** [P2] What happens when the ontology is applied to a domain boundary case not anticipated in the original design?
  - Inference path: domain_scope.md 'Bias Detection Criteria' → scope creep; concepts.md 'Interpretation Principles' → ontology provides consistent semantic system within specific scope
  - Verification criteria: PASS if the ontology's scope documentation includes explicit boundary cases and the response to out-of-scope usage is documented (e.g., "reject," "extend," "refer to another ontology"). FAIL if boundary cases are unaddressed and the ontology silently accepts out-of-scope concepts

- **CQ-X04** [P2] What happens when a class has no instances in the ABox but is referenced by multiple properties (empty but structurally important)?
  - Inference path: structure_spec.md 'Isolated Node Prohibition' → leaf class with no instances and no subclasses triggers warning; domain_scope.md 'Bias Detection Criteria' → instance absence makes validation impossible
  - Verification criteria: PASS if structurally important but instance-free classes are documented as intentionally abstract or pending population, distinguishing them from accidentally orphaned classes. FAIL if instance-free classes have no documentation explaining their role

- **CQ-X05** [P3] What happens when two competency questions require contradictory modeling choices?
  - Inference path: concepts.md 'Ontology Engineering Methodology Terms' → Competency Questions as requirements; logic_rules.md 'Reasoning Logic' → formal correctness and semantic correctness are independent
  - Verification criteria: PASS if conflicting requirements are identified and resolved with documented trade-off decisions (e.g., "CQ-A requires X, CQ-B requires NOT X, resolution: prioritize CQ-A because..."). FAIL if contradictory requirements exist without resolution

---

## Related Documents
- domain_scope.md — the upper-level definition of the areas these questions cover
- logic_rules.md — constraint/reasoning rules related to CQ-V (constraint verification), CQ-C (classification logic), and CQ-X (edge case reasoning)
- structure_spec.md — structure/classification rules related to CQ-E (entity definition), CQ-C (classification consistency), and CQ-P (quantitative thresholds)
- dependency_rules.md — inter-ontology dependencies related to CQ-I (interoperability), CQ-CR (change readiness), and CQ-X (import conflicts)
- concepts.md — definitions of terms used throughout these competency questions
