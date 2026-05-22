---
version: 2
last_updated: "2026-03-30"
source: bundled-domain-baseline
status: established
---

# Ontology Domain — Dependency Rules

Classification axis: **linkage type** — dependencies and connections classified by the type of relationship.

## Inter-Class Dependencies

- is-a relation graph: acyclic (DAG). Cyclic inheritance is a logical contradiction (A rdfs:subClassOf B, B rdfs:subClassOf A → A and B must be equivalent). If equivalence is intended, declare owl:equivalentClass explicitly. If not, the cycle is an error. Reference: OWL 2 Structural Specification, Section 9.1.1
- part-of relation: acyclic in principle. A part-of B, B part-of A implies the same entity, which is a modeling contradiction. If bidirectional composition is intended, use two distinct properties (e.g., hasPart/isPartOf with different semantics)
- depends-on relation: acyclicity is recommended. When mutual dependency is intentional, it must be explicitly declared with initialization/interpretation order defined. Undeclared circular depends-on relations cause infinite regress in modular loading

## Direction Rules

- Subclass → Superclass: the subclass depends on the superclass (inheritance). Changes to the superclass propagate downward to all subclasses. Adding a restriction to the superclass narrows all subclasses. Removing a restriction from the superclass widens all subclasses. Reference: OWL 2 Structural Specification, Section 9.1.1
- Property → Domain/Range class: the property depends on the class. Deleting the domain class invalidates the property (the property's domain becomes undefined, which in RDFS/OWL means it defaults to rdfs:Resource). Deleting the range class similarly invalidates the range constraint
- Instance → Class: the instance depends on the class. Deleting the class leaves the instance unclassified. Under OWA, the instance may still be inferred to belong to other classes; under CWA (SHACL), it becomes a validation failure
- External ontology import → Internal ontology: the internal ontology depends on the imported external concepts. Changes to the external ontology directly affect reasoning results in the internal ontology. Cross-reference: 'OWL Imports Chain Management' below

## Inter-Ontology Dependencies

- When importing an external ontology via owl:imports, all imported axioms are combined with internal axioms into a single logical theory. Unintended inferences may occur because axioms from different design contexts interact. Reference: OWL 2 Structural Specification, Section 3.4
- The version of the external ontology must be pinned to a version-specific URI. If not pinned, external changes may destroy internal consistency without warning. Cross-reference: 'Version Dependency Management' below
- Mapping (alignment) and import are fundamentally different. Mapping declares correspondence relations (owl:equivalentClass, skos:exactMatch) without integrating axioms — each ontology retains its own logical theory. Import integrates axioms into a single theory. Cross-reference: 'Alignment vs Integration Dependency Patterns' below
- Circular imports (A imports B, B imports A) are prohibited. Most reasoners handle this by loading each ontology once, but the combined axiom set may produce unexpected inferences. If bidirectional reference is needed, use mapping instead of import. Cross-reference: 'OWL Imports Chain Management' and 'Circular Dependency Resolution' below

## Inter-Property Dependencies

- Inverse relations: if hasAuthor is declared owl:inverseOf isAuthorOf, then hasAuthor(X,Y) entails isAuthorOf(Y,X). Changing one side's domain/range must be reflected in the other (domain of hasAuthor = range of isAuthorOf). Reference: OWL 2 Structural Specification, Section 9.2.3
- Sub-properties (rdfs:subPropertyOf): instances of the sub-property are also instances of the super-property. If sub-property P1 rdfs:subPropertyOf P2, then P1(A,B) entails P2(A,B). The sub-property's domain must be a subclass of (or equal to) the super-property's domain. Reference: RDFS Semantics, Section 3.2.3
- Property chains (owl:propertyChainAxiom): a property that shortcuts A → B → C. The chain depends on each constituent property. If any constituent property is deleted or its domain/range changes, the chain may become invalid. Reference: OWL 2 Structural Specification, Section 9.2.1
- Dependencies among complex properties propagate change impacts. Maintain a property dependency graph: given a change to property P, derive the list of all properties that reference P (via inverse, sub-property, or chain declarations). Cross-reference: logic_rules.md 'Reasoning Logic'

## Referential Integrity

- Classes declared as rdfs:domain or rdfs:range of properties must exist in the ontology (or be accessible via owl:imports)
- External ontologies referenced via owl:imports must be accessible at their declared URIs. If inaccessible, the reasoner's behavior is implementation-dependent. Cross-reference: 'OWL Imports Chain Management' (import failure handling)
- Classes and properties referenced by instances (ABox assertions) must be defined in the TBox (or imported). An instance asserting rdf:type of an undefined class is a referential integrity violation
- External concepts (URIs) referenced in mapping declarations must actually exist in the target ontology. A mapping to a nonexistent URI is a dangling reference
- Deprecated concepts (owl:deprecated true) that are still referenced by other concepts or instances must be identified. Maintain a deprecation impact list. Cross-reference: 'Version Dependency Management' (deprecation protocol)

## Truth Source Hierarchy

When multiple sources provide guidance on the same ontology modeling question, defer to the higher-priority source. Document any conflict and its resolution in the ontology's metadata (owl:versionInfo or rdfs:comment on the ontology IRI).

| Priority | Source | Authority Level |
|----------|--------|----------------|
| 1 | W3C Recommendation (OWL 2, SHACL, SPARQL, RDF, RDFS specs) | Normative standard. Defines correct behavior. Overrides all other sources |
| 2 | W3C Working Group Note (OWL 2 Primer, SKOS Reference, Best Practices) | Informative guidance. Explains intent and recommended usage but is not binding |
| 3 | Ontology Design Patterns (ODP community catalog, Manchester patterns) | Community best practice. Follow unless the domain requires documented deviation |
| 4 | Tool documentation (Protege, HermiT, Pellet, Apache Jena, RDFLib) | Implementation-specific behavior. May deviate from spec. When tool behavior contradicts a W3C Rec, the spec is correct and the tool has a bug or limitation |
| 5 | Internal conventions (project naming rules, URI patterns, local modeling decisions) | Local authority. Must not contradict levels 1-3. Documented in structure_spec.md and conciseness_rules.md |

Cross-reference: logic_rules.md 'Normative References' for the specific W3C documents at level 1.

## OWL Imports Chain Management

owl:imports establishes an axiom integration dependency. Managing import chains is critical because each import adds all axioms from the imported ontology (and transitively, from its imports) into the importing ontology's logical theory. Reference: OWL 2 Structural Specification, Section 3.4.

- **Transitivity**: If ontology A imports B and B imports C, then A also imports all axioms from C. This is by definition — owl:imports brings in the complete axiom closure. Verify that transitively imported ontologies do not introduce unintended axioms
- **Import chain depth**: Each level of transitive import adds all axioms from the imported ontology. At depth 3+, the total axiom count can grow significantly. Track total imported axiom count and reasoner performance. Large import chains (10,000+ total axioms) may cause reasoner timeouts for expressive profiles (DL, Full)
- **Version pinning**: owl:imports references a URI. If the URI points to a "latest" or unversioned location, the importing ontology's consistency depends on external changes outside the modeler's control. Pin to version-specific URIs (e.g., http://example.org/onto/2.0 rather than http://example.org/onto). Record the pinned version in rdfs:comment on the owl:imports declaration. Cross-reference: 'Version Dependency Management' below
- **Import failure handling**: If an imported URI is unreachable, the reasoner's behavior is implementation-dependent. Some fail immediately, some proceed with partial data (missing the unreachable ontology's axioms), some cache previously loaded versions. Define a fallback policy for the project:
  - Fail-fast (recommended for production): if any import is unreachable, halt reasoning and report the failure
  - Proceed-with-warning (acceptable for exploration): log the failure and continue, but mark all reasoning results as provisional
- **Circular import detection**: A imports B imports A. Most reasoners handle this by loading each ontology once (de-duplication), but the combined axiom set may produce unexpected interactions. Prohibition: do not create circular imports. If bidirectional reference between ontologies is needed, use mapping (owl:equivalentClass, skos:exactMatch) instead of import. Cross-reference: 'Circular Dependency Resolution' below

## Alignment vs Integration Dependency Patterns

When two ontologies need to reference each other's concepts, the choice between import and mapping determines how tightly coupled they become. Reference: OWL 2 Structural Specification, Section 3.4; SKOS Reference, Section 10.

- **Import (owl:imports)**: Full axiom integration. The imported ontology becomes part of the importing ontology's logical theory. Changes to the imported ontology directly affect reasoning results. Appropriate when one ontology is a foundation that the other builds upon (upper ontology / domain ontology relationship)
- **Mapping (owl:equivalentClass, owl:equivalentProperty, skos:exactMatch, skos:broadMatch, skos:narrowMatch)**: Declares correspondence without axiom integration. Each ontology retains its own axiom space and can evolve independently. Appropriate when two peer ontologies in different domains need interoperability
- Rule: If two ontologies need to reference each other's concepts but must maintain independent evolution → use mapping, not import. Import creates a unidirectional hard dependency; mapping creates a soft dependency that can be updated without affecting either ontology's internal consistency
- Rule: If one ontology is a foundation that the other builds upon (upper/lower relationship) → use import. The lower ontology inherits and extends the upper ontology's axioms
- Rule: If two peer ontologies in different domains need interoperability → create a bridge ontology that imports both and defines cross-domain mappings. Neither peer ontology imports the other. The bridge ontology is the only point of integration and can be maintained independently. Cross-reference: logic_rules.md 'Constraint Conflict Checking' (Conflict type 4)

## Circular Dependency Resolution

Circular dependencies in ontologies can occur at the class level, property level, or import level. Each pattern has a specific resolution mechanism.

- **Pattern 1 — Class definition circularity**: Class A is defined in terms of B (e.g., A owl:equivalentClass (someValuesFrom P B)), and B is defined in terms of A (B owl:equivalentClass (someValuesFrom Q A)). Resolution: identify which class is more primitive (closer to the domain's foundational concepts). Define the primitive class first using only terms that do not reference the other class. Then define the second class referencing the first. If neither is more primitive, introduce a common superclass that both reference. Reference: Ontology Design Patterns — Primitive/Defined class pattern
- **Pattern 2 — Property domain/range circularity**: Property P has domain A and range B. Property Q has domain B and range A. Classes A and B are defined using restrictions on P and Q respectively. Resolution: declare one property as primitive (with independently defined domain and range classes) and define the other as its owl:inverseOf or via owl:propertyChainAxiom. Ensure that at least one class (A or B) has a definition that does not depend on the other class
- **Pattern 3 — Import circularity**: Ontology A imports B, B imports A. Resolution: extract the shared concepts that both ontologies need into a third ontology C. Have both A and B import C, but neither imports the other. This breaks the cycle while preserving access to shared concepts. Cross-reference: 'OWL Imports Chain Management' above

## Version Dependency Management

Ontology versioning affects all downstream consumers. Proper version management prevents silent breakage when dependencies evolve. Reference: OWL 2 Structural Specification, Section 3.1 (Ontology IRI and Version IRI).

- **Ontology IRI vs Version IRI**: The ontology IRI identifies the ontology across all versions (stable identifier). The version IRI identifies a specific version (snapshot identifier). Imports should use version IRIs for reproducibility. The ontology IRI without a version IRI always refers to the "latest" version, which is unsuitable for production dependencies
- **Backward compatibility rules**:
  - Adding new classes, properties, or instances → backward compatible. Existing consumers are unaffected
  - Removing or renaming classes/properties → breaking change. Existing consumers that reference the removed entity will have dangling references
  - Changing rdfs:domain or rdfs:range → potentially breaking. Existing instances may become invalid under the new constraints (e.g., a narrower domain excludes previously valid subjects)
  - Adding owl:disjointWith declarations → potentially breaking. Existing instances that belong to both classes become inconsistent
- **Deprecation protocol**: (1) Add owl:deprecated "true"^^xsd:boolean to the entity (2) Add rdfs:comment with replacement guidance (which entity to use instead) (3) Retain the deprecated entity for at least one version cycle so consumers can migrate (4) Remove in the next major version. Reference: OWL 2 Structural Specification, Section 5.5 (Annotations)
- **External standard versioning**: When W3C publishes a new version of a standard vocabulary, assess impact on all internal ontologies that import it. Historical example: OWL 1 → OWL 2 migration changed semantics of several constructs (e.g., property characteristics, punning rules). Maintain an external dependency inventory that lists each imported ontology, its version, and the date of last compatibility check

## Source of Truth Management

- Source of truth for class/property definitions: TBox. ABox (instances) is subordinate to TBox — instances must conform to TBox definitions. If an instance contradicts a TBox axiom, the instance data is wrong (not the TBox), unless the TBox is being revised
- When the ontology reuses external standard vocabularies (Dublin Core, SKOS, FOAF, Schema.org), those standards are the source of truth for the reused terms. Their semantics must not be redefined internally. If internal semantics differ from the standard, create a local term and map it to the standard term via skos:closeMatch or skos:relatedMatch. Cross-reference: 'Truth Source Hierarchy' above (level 1-2 sources)
- When two mapped ontologies have different definitions for the same concept, the mapping document must specify which definition takes precedence in each usage context. If no precedence is specified, the mapping is ambiguous and may cause inconsistent reasoning
- When natural language definitions (rdfs:comment, skos:definition) and formal definitions (OWL axioms) are inconsistent, the formal definition is the source of truth for reasoning and verification. Natural language is for conveying intent to human users. If the two diverge, update the natural language to match the formal definition

## External Dependency Management

- When using standard ontologies (RDFS, OWL, SKOS, Dublin Core, FOAF, PROV-O, Schema.org), specify namespace URI and version. Record in the ontology's metadata. Reference: each vocabulary's W3C Recommendation or specification
- Change detection for external ontologies: monitor version URI changes or changelogs. For W3C vocabularies, subscribe to the relevant Working Group's update announcements. For community ontologies, monitor the source repository
- Deprecation response plan: when an external ontology is deprecated, (1) identify all internal references to the deprecated ontology, (2) evaluate the recommended replacement, (3) plan migration within one internal version cycle, (4) retain backward-compatible mappings to the deprecated terms during transition. Cross-reference: 'Version Dependency Management' (deprecation protocol)
- License compatibility: the license of the external ontology must be compatible with the internal ontology's distribution/modification terms. W3C Recommendations are published under W3C Document License (permissive). Community ontologies vary — verify before importing

## Related Documents
- concepts.md — definitions of relation types, mapping, version management, and OWA/CWA terms
- structure_spec.md — class hierarchy, namespace rules, and URI conventions
- logic_rules.md — classification logic, reasoning logic, SHACL validation, profile rules, and constraint conflict checking
- competency_qs.md — dependency verification questions
- domain_scope.md — scope of these dependency rules
- extension_cases.md — extension scenarios
- conciseness_rules.md — conciseness rules
