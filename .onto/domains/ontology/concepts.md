---
version: 2
last_updated: "2026-03-30"
source: bundled-domain-baseline
status: established
---

# Ontology Domain — Concept Dictionary and Interpretation Rules

Classification axis: **normative system** — classification by the standard/specification system to which each term belongs.

## Basic Component Terms

- Class = a set of entities sharing the same characteristics. Formally represents a concept in an ontology
- Instance = an individual entity belonging to a class. Also called an Individual
- Property = describes characteristics of an entity. Divided into Object Property (relations between entities) and Data Property (data values of entities)
- Relation = a semantic connection between two entities. Has directionality, cardinality, and inverse relations
- Axiom = a statement declared as true in an ontology. The foundation for reasoning

## Normative System Classification

Ontology standards form a layered system. Each layer builds on the one below it. Understanding which layer a term belongs to determines how it should be applied and what formal guarantees it provides.

### Layer 1 — Foundation Standards (W3C Recommendations)

These define the formal framework. All ontology work uses at least one of these.

- RDF (Resource Description Framework) = the data model layer. Everything is expressed as Subject-Predicate-Object triples. All higher layers build on RDF. A triple is the atomic unit: `ex:Socrates rdf:type ex:Human .`
- RDFS (RDF Schema) = lightweight class/property vocabulary built on RDF. Defines `rdfs:Class`, `rdfs:subClassOf`, `rdfs:domain`, `rdfs:range`. Provides basic type hierarchy without full logical expressivity. Sufficient for simple taxonomies
- OWL 2 (Web Ontology Language) = formal ontology language built on RDF. Adds axioms, restrictions, and reasoning capabilities. Three profiles (EL, QL, RL) trade expressivity for computational tractability. The primary language for formal ontologies
- SHACL (Shapes Constraint Language) = data validation layer. Validates RDF data against shape constraints. Operates at instance level — checks whether actual data conforms to expected structure. Complementary to OWL (OWL defines what is logically possible; SHACL checks what is structurally conformant)
- SPARQL = query language for RDF data. The primary consumption interface for ontologies. SELECT retrieves variable bindings, CONSTRUCT creates new triples, ASK returns boolean, DESCRIBE returns resource descriptions

### Layer 2 — Vocabulary Standards (W3C Recommendations/Notes)

These provide reusable vocabularies that ontologies import rather than reinvent.

- SKOS (Simple Knowledge Organization System) = concept schemes, preferred/alternative labels, hierarchical relations (broader/narrower), associative relations (related). Designed for thesauri, taxonomies, classification schemes. Less formal than OWL — captures lexical and navigational relationships, not logical axioms
- Dublin Core Terms (DCT) = metadata vocabulary. `dct:creator`, `dct:date`, `dct:format`, `dct:subject`, etc. The standard way to attach bibliographic metadata to any RDF resource
- PROV-O = provenance vocabulary. Three core classes: Entity (thing), Activity (process), Agent (responsible party). Tracks derivation chains: what was derived from what, by which activity, attributed to which agent
- OWL Time = temporal entities and relations. Instants, intervals, duration descriptions. Used when temporal reasoning is needed beyond simple date literals

### Layer 3 — Domain Standards

These apply Layer 1 and Layer 2 to specific fields.

- Schema.org = web markup vocabulary. Broad but shallow — covers many domains (people, organizations, events, products) without deep axiomatization. Widely adopted for SEO and structured data on the web
- FIBO (Financial Industry Business Ontology) = OWL-based ontology for financial industry concepts. OMG standard. Covers securities, loans, derivatives, corporate entities. Example of a large-scale, formally axiomatized domain ontology
- SNOMED CT = medical terminology system. Uses EL++ (OWL 2 EL profile) for tractable classification. 350K+ concepts. Demonstrates that very large ontologies require restricted expressivity to remain computationally feasible
- Gene Ontology (GO) = biological processes, molecular functions, cellular components. DAG (Directed Acyclic Graph) structure, not full OWL. Three independent sub-ontologies linked by `is_a` and `part_of` relations
- GeoSPARQL = geospatial ontology and query extension for SPARQL. Defines spatial objects, geometries, and topological relations (intersects, contains, overlaps, etc.)

### Relationship Between Layers

Layer 1 defines the formal framework. Layer 2 provides reusable vocabularies. Layer 3 applies both to specific domains. A well-designed ontology uses Layer 1 for structure, reuses Layer 2 where applicable, and adds Layer 3 terms for domain specifics. Skipping Layer 1 means no formal foundation; ignoring Layer 2 means reinventing standard vocabularies unnecessarily. See also: structure_spec.md for structural design patterns across layers.

## Description Logic Terms

Description Logic (DL) is the formal logic underlying OWL. Different DL fragments determine expressivity and computational complexity. Choosing a DL fragment is a design decision: more expressivity enables richer modeling but increases reasoning cost.

- ALC (Attributive Language with Complements) = the basic DL providing union (C ⊔ D), intersection (C ⊓ D), complement (¬C), existential restriction (∃R.C), and universal restriction (∀R.C). The minimal DL with full boolean operations on concepts
- SHIQ = ALC extended with role hierarchy (H: properties can have sub-properties), inverse roles (I: if R relates A to B, R⁻ relates B to A), and qualified number restrictions (Q: "at least 3 values from class C"). Expressive enough for many real ontologies
- SHOIN(D) = the DL basis of OWL DL (OWL 1). SHIQ + nominals (O: named individuals in class expressions), unqualified number restrictions (N), and datatypes (D: string, integer, etc.). Reasoning complexity: NExpTime
- SROIQ(D) = the DL basis of OWL 2 DL. Adds complex role inclusion axioms (role chains like "hasPart o hasLocation → hasLocation"), reflexive/irreflexive/asymmetric/disjoint role properties. Reasoning complexity: 2NExpTime
- EL++ = tractable fragment allowing existential restrictions (∃R.C) but not universal restrictions (∀R.C), complement (¬C), or disjunction (C ⊔ D). Classification (computing subsumption hierarchy) is polynomial time. SNOMED CT uses this fragment — 350K+ concepts require tractable reasoning
- DL-Lite = tractable fragment optimized for query answering. Conjunctive query answering is in AC⁰ (within the data complexity). Basis of OWL 2 QL profile. Designed for scenarios where ontology reasoning must scale to large databases
- Decidability = the property that a reasoning algorithm is guaranteed to terminate with a correct yes/no answer for any input. OWL 2 DL is decidable; OWL 2 Full (which allows treating classes as instances) is not. Undecidability means a reasoner may run forever on certain inputs
- Computational complexity classes: P (polynomial), NP (nondeterministic polynomial), ExpTime (exponential), NExpTime (nondeterministic exponential), 2NExpTime (double nondeterministic exponential). These describe worst-case reasoning time as ontology size grows. EL++ classification is P; OWL 2 DL consistency checking is 2NExpTime. Practical reasoners often perform much better than worst-case bounds suggest

See also: logic_rules.md for reasoning rules and constraint application patterns.

## Ontology Engineering Methodology Terms

These terms describe how ontologies are built, not what they contain. Methodology choice affects the resulting ontology's quality, maintainability, and fitness for purpose.

- METHONTOLOGY = structured ontology development methodology with phases: specification (scope, purpose, granularity), conceptualization (glossary, concept taxonomies, ad-hoc binary relations), formalization (translation to formal language), implementation (encoding in OWL/RDFS), and maintenance (evolution management). Developed at UPM Madrid. Assumes a single-ontology lifecycle
- NeOn Methodology = scenario-based methodology for building ontology networks (interconnected ontologies). Defines 9 scenarios covering: building from scratch, reusing existing ontologies, reusing non-ontological resources (databases, thesauri), re-engineering, aligning, merging, localizing (multilingual), modularizing, and restructuring. More realistic than single-ontology methods for real projects
- Competency Questions (CQs) = natural language questions the ontology must be able to answer. The primary requirements specification method for ontologies. Example: "What are the subclasses of Vehicle that have more than 4 wheels?" A competency question that cannot be expressed as a SPARQL query against the ontology indicates a modeling gap. See also: competency_qs.md
- Ontology Design Pattern (ODP) = a reusable solution to a recurring ontology modeling problem. Types include: Content Patterns (domain-specific modeling solutions), Structural Patterns (logical constructs like n-ary relations), and Correspondence Patterns (alignment between ontologies). The ODP repository (ontologydesignpatterns.org) catalogs established patterns
- Modular Ontology = an ontology composed of separate, independently maintainable modules connected by `owl:imports` or alignments. Benefits: independent evolution, selective reuse, reduced reasoning scope. Risk: import chains can introduce unintended axioms (see monotonicity in Interpretation Principles)
- Ontology Evaluation = assessing ontology quality along multiple dimensions: structural (logical consistency, no redundant axioms), functional (answers competency questions correctly), and usability (documentation, naming conventions, tool compatibility). No single metric captures quality — evaluation is multi-dimensional

## Relation Type Terms

- is-a (subclass-of) = superclass/subclass classification relation. The subclass inherits all characteristics of the superclass
- part-of (mereological) = part-whole relation. The compositional relationship between whole and parts. May or may not be transitive
- has-property = property possession relation. An entity has a specific property value
- depends-on = dependency relation. The existence or definition of one entity depends on another
- equivalent-to = equivalence relation. Two classes or properties are semantically identical
- disjoint-with = disjointness relation. Two classes cannot have common instances
- causes = causal relation. A causes B. Directional. Not necessarily transitive — indirect causation (A causes B, B causes C, therefore A causes C) requires explicit declaration, because causal chains can have intervening conditions that break transitivity
- precedes / follows = temporal ordering relation. A precedes B in time or process sequence. Transitive: if A precedes B and B precedes C, then A precedes C. Distinct from causes — temporal order does not imply causation
- derives-from = derivation/provenance relation. B is derived from A. Used for data lineage (this dataset derives from that source), concept evolution (this concept derives from that earlier definition), or material transformation. See PROV-O's `prov:wasDerivedFrom` for the standard vocabulary
- overlaps = partial overlap between two classes or regions. Neither fully contains the other. Symmetric: if A overlaps B, then B overlaps A. Useful in spatial ontologies (GeoSPARQL) and in modeling partial taxonomic overlap
- complements = complementary relation. A and B together cover a complete space with no gap and no overlap. Formally: A ⊔ B = TopClass and A ⊓ B = ⊥. Example: Vertebrate and Invertebrate complement each other within Animal
- instantiates = the relation between an instance and its class (expressed as `rdf:type` in RDF). Distinct from is-a: instantiates links an individual to a class; is-a links a class to a superclass. `ex:Socrates rdf:type ex:Human` (instantiates) vs. `ex:Human rdfs:subClassOf ex:Animal` (is-a)

See also: dependency_rules.md for how these relations interact and constrain each other.

## Constraint-Related Terms

- Domain = the subject class to which a property applies. "What class of entities does this property apply to?"
- Range = the class or data type that can be a property's value. "What can be the value of this property?"
- Cardinality = a constraint on the number of entities participating in a relation. min, max, exact
- Closure Axiom = a constraint that only what is stated is true. The opposite of the Open World Assumption
- Disjoint Union = subclasses are mutually exclusive and completely partition the superclass

## Ontology Design Terms

- TBox = Terminological Box. The set of class and property definitions. Corresponds to a schema
- ABox = Assertional Box. The set of instances and their relations. Corresponds to data
- Open World Assumption (OWA) = what is not stated is not false but unknown. The default assumption in OWL
- Closed World Assumption (CWA) = what is not stated is false. The default assumption in databases
- Reasoner = software that derives implicit knowledge based on axioms. Performs consistency checking and classification inference
- Ontology Alignment = the task of establishing correspondence between concepts in different ontologies

## Version Management Terms

- Deprecation = notice that a concept/relation will be maintained but removed in the future. A replacement concept must be specified
- Backward Compatible = existing instances and queries work without modification
- Breaking Change = a change that breaks existing instances or queries (class deletion, constraint tightening, etc.)

## Homonyms Requiring Attention

- "property": OWL Object Property (inter-entity relation) ≠ OWL Data Property (data value) ≠ programming property (field/attribute)
- "class": ontology class (concept set) ≠ programming class (code structure)
- "instance": ontology instance (individual entity) ≠ programming instance (object)
- "domain": ontology domain (property's domain) ≠ business domain (business area) ≠ DDD domain
- "type": ontology type (rdf:type, class membership) ≠ programming type (data type)
- "schema": ontology schema (TBox) ≠ DB schema ≠ JSON Schema ≠ Schema.org
- "constraint": ontology constraint (axiom/SHACL) ≠ DB constraint (CHECK, FOREIGN KEY) ≠ business rule
- "graph": RDF graph (a set of triples, identified by a named graph URI) ≠ knowledge graph (an entity-relation network, often backed by RDF but may use property graphs) ≠ mathematical graph (abstract nodes and edges) ≠ visualization graph (visual chart/diagram)
- "model": ontology model (formal representation of a domain's concepts and relations) ≠ data model (database schema design) ≠ ML model (trained statistical model) ≠ UML model (software design diagram)
- "resource": RDF resource (anything identifiable by a URI — classes, instances, properties are all resources) ≠ REST resource (an endpoint's entity) ≠ system resource (CPU, memory, disk)
- "literal": RDF literal (a data value with a datatype, e.g., `"42"^^xsd:integer`) ≠ programming literal (a hardcoded value in source code) ≠ natural language literal (non-figurative, direct meaning)
- "vocabulary": RDF vocabulary (a set of terms defined in a namespace, e.g., Dublin Core, FOAF) ≠ controlled vocabulary (a curated, closed list of terms for consistent indexing) ≠ natural language vocabulary (words known to a speaker)
- "annotation": OWL annotation property (metadata attached to ontology entities — labels, comments, version info — with no logical effect on reasoning) ≠ Java annotation (@Override, @Deprecated) ≠ data annotation (labeling training data for ML)
- "import": `owl:imports` (incorporates all axioms from another ontology into the current one, monotonically) ≠ programming import (makes code from another module available) ≠ data import (ETL process loading external data)

## Synonym and Inclusion Relationships

Terms that refer to the same concept across different formalisms or communities, and terms that stand in subset/superset relationships. Distinguishing synonyms (=) from inclusion (⊃) prevents category errors.

- Individual = Instance = Member (in set theory context). "Individual" is OWL terminology; "Instance" is common usage across ontology and database communities; "Member" appears in formal set theory. All refer to a single entity belonging to a class
- Ontology ⊃ Taxonomy ⊃ Controlled Vocabulary. Each right-side term is a restricted form of the left. A controlled vocabulary is a fixed list of terms. A taxonomy adds hierarchical (broader/narrower) relations. An ontology adds formal axioms, constraints, and arbitrary relations. A taxonomy IS an ontology — a specific, limited kind. "Knowledge Representation System" is sometimes used as a synonym for ontology, but more precisely it is a broader category that includes ontologies, frames, semantic networks, and logic programs
- Class = Concept (in SKOS) = Type (in Schema.org) = Category (in informal usage). Same modeling intent — grouping entities by shared characteristics — but different formalism levels. "Class" in OWL carries full logical semantics (axioms, restrictions); "Concept" in SKOS carries only lexical/navigational semantics; "Type" in Schema.org carries markup semantics
- Object Property = Relation = Association (in UML). "Object Property" is OWL-specific terminology for a property linking two individuals. "Relation" is the general ontology term. "Association" is the UML term for a structural relationship between classes
- Data Property = Attribute = Field (in databases). "Data Property" is OWL-specific for a property linking an individual to a literal value. "Attribute" is the general term. "Field" is the database/programming term
- Axiom = Assertion = Statement (in logic). "Axiom" implies the statement is taken as given (not derived from other statements). "Assertion" in ABox context means a fact about an individual. "Statement" is the most general term — any proposition that can be true or false
- Reasoner = Inference Engine = Classifier (when specifically performing subsumption — computing the is-a hierarchy). "Reasoner" is the standard DL/OWL term. "Inference Engine" is the broader AI/expert system term. "Classifier" is used when the specific task is taxonomic classification

## Interpretation Principles

- The purpose of an ontology is not "to represent everything in the world" but "to provide a consistent semantic system within a specific scope." An ontology without scope cannot be completed
- OWL's Open World Assumption and the database's Closed World Assumption produce different inference results for the same data. If the difference in assumptions is not stated, verification results become ambiguous
- "A class exists" and "a class is correctly defined" are not the same. A class without properties/constraints/relations is an empty shell with only a name
- Formal representations (OWL, SHACL) and natural language definitions require separate verification. A formally correct axiom may differ from its intended meaning
- When classification criteria are mixed (e.g., functional and structural classification at the same level), cross-classification occurs and the classification system becomes incomplete
- When an ontology uses both RDFS and OWL constructs, OWL semantics take precedence for reasoning. An RDFS-only tool processing the same data will produce different (weaker) inferences — it will not recognize OWL restrictions, cardinality constraints, or disjointness axioms. This is not an error in either tool; it is a consequence of the semantic layer being applied
- SKOS and OWL serve different purposes on the same data. SKOS captures lexical and navigational relationships (preferred labels, broader/narrower, scope notes). OWL captures logical relationships (axioms, restrictions, entailments). Applying OWL reasoning to SKOS data or treating SKOS relations as logical axioms produces category errors. A `skos:broader` relation is NOT equivalent to `rdfs:subClassOf` — the former is a vocabulary navigation aid, the latter is a logical subsumption with inheritance semantics
- The same real-world entity may be represented differently across ontology types: as a `owl:Class` in a formal ontology, as a `skos:Concept` in a thesaurus, and as a `schema:Type` in Schema.org markup. These are not equivalent representations — the formal commitments differ. Converting between them requires deliberate mapping, not mechanical renaming
- `owl:imports` is monotonic: importing an ontology only adds axioms, never removes them. This means importing a contradictory ontology makes the entire combined ontology logically inconsistent (everything becomes entailed), with no partial rollback possible. Import chains must be reviewed for compatibility before inclusion. See also: dependency_rules.md for import management rules
- Version management in ontologies differs fundamentally from software versioning: a concept's URI persists across versions (its identity IS the URI), while its definition (axioms, labels, relations) may change. Changing a URI creates a new concept, not a new version of the existing one. Deprecation (marking old URIs with `owl:deprecated true` and linking to replacement URIs) is the standard evolution mechanism, not deletion

## Related Documents
- domain_scope.md — the scope definition where these terms are used
- logic_rules.md — rules related to axioms, reasoning, and constraints
- structure_spec.md — ontology structural design rules
- dependency_rules.md — inter-standard dependencies and import management
- competency_qs.md — questions these concepts must be able to answer
- extension_cases.md — extension scenarios
- conciseness_rules.md — conciseness rules
