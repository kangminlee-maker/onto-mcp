---
version: 2
last_updated: "2026-03-30"
source: bundled-domain-baseline
status: established
---

# Ontology Domain — Domain Scope Definition

This is the reference document used by coverage to identify "what should exist but is missing" in ontology design.
This domain applies when **reviewing** an ontology (a knowledge structuring system).

## Ontology Type Classification

Classification axis: **organizing principle** — classified by the core principle through which an ontology organizes knowledge.

| Type | Core Principle | Representative Examples |
|---|---|---|
| Axiom-based | Rigorously defines inter-concept relations using formal logic and axioms | OWL DL, SUMO |
| Action-Centric | Describes the domain centered on actions and processes | PSL (Process Specification Language) |
| Knowledge Graph | Graph structure of entities and relations | Wikidata, Google Knowledge Graph |
| Domain-Driven | Structures expert knowledge of a specific domain | SNOMED CT, Gene Ontology |
| Taxonomy | Hierarchical classification system (centered on is-a relations) | Biological taxonomy, library classification |
| Schema | Defines data structures and constraints (for instance validation) | Schema.org, JSON-LD |

## OWL 2 Profile Classification

An OWL 2 profile is a syntactic restriction of OWL 2 that trades expressivity for computational guarantees. Profile selection determines which reasoning tasks are tractable. Selecting the wrong profile either blocks required inferences (too weak) or makes reasoning intractable (too strong).

| Profile | Expressivity | Decidability | Reasoning Complexity | Representative Use Cases |
|---|---|---|---|---|
| EL | Existential restrictions, conjunction, limited role inclusions | Decidable | Polynomial (classification) | SNOMED CT (350K+ concepts), Gene Ontology, NCI Thesaurus |
| QL | Conjunctive query answering, limited existential/inverse | Decidable | LogSpace data complexity (query answering) | RDBMS-backed ontologies, OBDA (Ontology-Based Data Access) systems |
| RL | Rule-based reasoning, limited universal restrictions | Decidable | Polynomial data complexity | RDF validation, business rule engines, OWL-RL reasoners (e.g., Oracle RDF) |
| DL | Full Description Logic (SROIQ(D)): nominals, role chains, qualified cardinality | Decidable | Worst-case 2NExpTime (combined complexity) | General-purpose formal ontology, FIBO (Financial Industry Business Ontology) |
| Full | RDF-compatible, no syntactic restrictions | Undecidable | N/A (no complete reasoning) | Maximum expressivity; rarely used in practice due to undecidability |

Cross-reference: Profile selection criteria for specific design decisions are in structure_spec.md ("OWL 2 Profile Selection Criteria").

## Major Sub-areas

### Core
- **Entity Definition** (required): classes, instances, entity identification and definition. Naming conventions and unique identifier systems. SNOMED CT's concept model distinguishes defining concepts (fully axiomatized, sufficient conditions for classification) from primitive concepts (necessary conditions only, requiring manual assertion). Schema.org's type hierarchy demonstrates a pragmatic approach where entities are defined by expected properties rather than formal axioms. Entity definition must specify whether concepts are defined or primitive, as this determines reasoner behavior during classification
- **Relation Definition** (required): types of relations between entities (is-a, part-of, has-property, depends-on, etc.), directionality and cardinality of relations. Gene Ontology uses 3 core relation types (is_a for subsumption, part_of for mereological composition, regulates/positively_regulates/negatively_regulates for causal relations), each with formally specified logical properties. Wikidata's property system uses P-identifiers (e.g., P31 for "instance of," P279 for "subclass of") with explicit constraints (single-value, value-type, item-requires-statement). Relation definitions must include logical properties (transitivity, symmetry, reflexivity, functionality) and formal domain/range declarations
- **Constraint Definition** (required): axioms, invariants, domain/range constraints, cardinality constraints. SHACL shapes are used in DCAT (Data Catalog Vocabulary) validation to enforce structural constraints on dataset metadata (e.g., every dcat:Dataset must have at least one dcat:distribution). OWL restrictions in FIBO define complex constraints such as qualified cardinality restrictions on financial instrument properties (e.g., a Bond must have exactly one maturityDate of type xsd:date). Constraint definitions must distinguish TBox-level constraints (ontology structure) from ABox-level constraints (instance data validation)
- **Classification System** (required): superclass/subclass hierarchies, whether multiple inheritance is allowed, consistency of classification criteria. Linnaean taxonomy (Kingdom > Phylum > Class > Order > Family > Genus > Species) demonstrates a strictly single-inheritance hierarchy with fixed classification axes at each level. Library of Congress Classification uses faceted classification with mixed-axis notation (first letter = broad discipline, subsequent characters = topic subdivision). Classification systems must declare their inheritance model (single vs. multiple), axis assignment per level, and MECE (Mutually Exclusive, Collectively Exhaustive) status
- **Glossary** (required): definitions of domain terms, synonym/homonym handling, multilingual labels. SKOS-XL (SKOS eXtension for Labels) supports complex label management where labels are themselves resources with properties (e.g., provenance, phonetic form, abbreviation). Wikidata's multilingual label system provides labels, descriptions, and aliases in 400+ languages, demonstrating industrial-scale multilingual ontology management. Glossary definitions must specify canonical labels, alternative labels (synonyms), hidden labels (for search), and language tags

### Supporting
- **Meta Model** (when applicable): an upper ontology describing the structure of the ontology itself. Meta-level definitions of classes/properties/relations
- **Mapping/Alignment** (when applicable): concept correspondence between different ontologies. Equivalence, subsumption, and similarity relations
- **Version Management** (when applicable): ontology change history, cross-version compatibility, deprecation procedures. (See also: bias detection criterion "temporal blindness" below)
- **Query Interface** (when applicable): approaches for accessing the ontology via SPARQL, OWL API, etc.

### Application
- **Reasoning/Verification** (when applicable): consistency checking via reasoners, classification inference, instance validation
- **Visualization** (scale-dependent): graph visualization of ontology structure, exploration interfaces
- **Data Integration** (when applicable): semantic integration of heterogeneous data sources, ontology-based ETL

## Required Concept Categories

These are concept categories that must be addressed in any ontology.

| Category | Description | Risk if Missing |
|---|---|---|
| Entity identity | A system for uniquely identifying entities (URI, IRI, etc.) | Entity confusion, reference failure |
| Relation typing | Explicit classification of relation kinds and their meanings | Ambiguous relation semantics, inference errors |
| Constraint declaration | Explicit declaration of structural/semantic constraints | Invalid instance creation, consistency breakdown |
| Classification consistency | Classification criteria applied consistently across the entire system | Cross-classification, classification omissions |
| Change tracking | History of concept/relation additions, modifications, and deletions | Regressions, compatibility breakage |
| Application context | Explicit statement of the ontology's intended purpose and scope | Over-design or under-design |
| Provenance tracking | Record of who created or modified concepts and when (see PROV-O in Reference Standards) | Accountability failure, audit impossibility, disputed authorship |
| Modularity boundaries | Explicit declaration of which parts can be independently imported and reused | Monolithic coupling, import bloat, unintended axiom inclusion |
| Competency scope | Explicit enumeration of queries the ontology must answer (see competency_qs.md) | Scope ambiguity, untestable completeness claims |

## Reference Standards/Frameworks

| Standard | Application Area | Usage |
|---|---|---|
| OWL 2 (Web Ontology Language) | Constraint definition, reasoning/verification | Expression language for formal ontologies, reasoner support |
| RDFS (RDF Schema) | Relation definition, classification systems | Class/property definitions for lightweight ontologies |
| SKOS (Simple Knowledge Organization System) | Glossary, classification systems | Concept schemes, labels, hierarchical relation representation |
| SHACL (Shapes Constraint Language) | Constraint definition, instance validation | Data shape constraints and validation rules |
| Dublin Core | Meta model, glossary | Standard vocabulary for metadata elements |
| Ontology Design Patterns (ODP) | Structural design overall | Catalog of reusable design patterns |
| OWL Time | Temporal entity representation | Instants, intervals, temporal relations (Allen's interval algebra). Required when ontology models events, durations, or temporal ordering |
| PROV-O (PROV Ontology) | Provenance tracking | Entities, activities, agents, and their derivation/attribution/delegation relations. W3C recommendation for tracking "who did what and when" |
| DCAT (Data Catalog Vocabulary) | Dataset/catalog metadata | Describes datasets, distributions, and data services. Required when the ontology manages or references external datasets |
| QUDT (Quantities, Units, Dimensions, Types) | Quantities and units of measure | Formal representation of physical quantities, units, and dimension vectors. Required when ontology includes measurable properties |
| GeoSPARQL | Geospatial ontology | Spatial objects, geometries, topological relations (contains, intersects, etc.). OGC standard for geospatial RDF data |

## Bias Detection Criteria

- If the ontology is designed for only one of the 6 ontology types without stated rationale for the type selection -> **type bias**
- If entity definitions are rich but relation definitions are sparse -> **structural bias (entity overload)**
- If relation definitions are rich but constraint definitions are absent -> **unverifiable (constraint absence)**
- If only classification systems exist with no properties/relations -> **classification bias (taxonomy trap)**
- If only formal representations exist with no natural language definitions -> **missing consumer perspective (machine bias)**
- If only natural language definitions exist with no formal constraints -> **unverifiable (informality bias)**
- If OWL 2 Full is used without justification when a profile (EL/QL/RL/DL) suffices -> **expressivity overkill**. Full OWL is undecidable; no reasoner can guarantee complete inference. Profile selection must be justified by expressivity requirements that no decidable profile can satisfy
- If TBox is defined but ABox has no instances -> **instance absence (validation impossible)**. Without instances, constraint satisfaction cannot be empirically tested, SHACL shapes cannot be validated, and competency questions (competency_qs.md) cannot be answered with concrete data
- If only OWL is used with no SKOS labels or SHACL validation -> **single-standard dependency**. OWL alone cannot serve all consumers: SKOS provides human-navigable concept schemes and labels, SHACL provides instance-level data validation. A production ontology typically requires all three
- If the ontology covers more than the stated scope without rationale -> **scope creep**. Concepts outside the declared application context (see "Required Concept Categories") increase maintenance burden and reasoning time without contributing to competency questions
- If no version management or deprecation procedures exist -> **temporal blindness**. Ontologies evolve; without versioning, consumers cannot detect breaking changes, deprecated concepts persist indefinitely, and import chains (dependency_rules.md) become fragile
- If only one sub-area (e.g., entity definitions) is deeply developed while others are skeletal -> **vertical bias (depth without breadth)**. An ontology with 200 classes but 5 relations and 0 constraints is structurally incomplete regardless of class quality. The entity-relation ratio threshold (>3:1) in conciseness_rules.md quantifies one aspect of this imbalance

## Related Documents
- concepts.md — definitions of terms within this scope
- structure_spec.md — specific rules for ontology structure, including golden relationships and quantitative thresholds
- competency_qs.md — questions this scope must be able to answer
- logic_rules.md — constraint conflict checking, reasoning logic
- dependency_rules.md — inter-ontology dependencies and mapping-related rules
- extension_cases.md — expansion scenarios
- conciseness_rules.md — conciseness rules, including entity-relation ratio thresholds
