---
version: 2
last_updated: "2026-03-30"
source: bundled-domain-baseline
status: established
---

# Ontology Domain — Extension Scenarios

The evolution agent simulates each scenario to verify whether the existing ontology structure breaks.

---

## Case 1: Adding a New Class

### Situation

Adding a new class to an existing classification system. The new class must integrate without introducing classification inconsistencies or violating disjointness constraints.

### Case Study: Gene Ontology — "biological regulation" (GO:0065007)

GO added "biological regulation" as a new top-level term, requiring reclassification of hundreds of terms previously scattered by target process rather than regulatory function. This introduced a second classification axis at the same hierarchy level. GO resolved it via multiple inheritance, but required verifying no disjointness violations across the 30,000+ term DAG.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | New class needs ≥1 property/relation (structure_spec.md §Required Relations); rdfs:label required |
| Relation structure | Sibling disjointness declarations must be reviewed; new class may join existing disjoint sets |
| Classification consistency | Must use same axis as siblings (structure_spec.md §Classification Criteria Design) |
| Constraint validity | Inherits superclass constraints; cannot relax (structure_spec.md §Hierarchy Structure Principles) |
| Interoperability | External mappings to sibling classes may become inaccurate |

### Verification Checklist

- [ ] Same classification axis as siblings → structure_spec.md §Classification Criteria Design
- [ ] Disjointness with siblings maintained or disjoint union updated → logic_rules.md §Classification Logic
- [ ] Superclass constraints not relaxed → logic_rules.md §Classification Logic
- [ ] Diamond inheritance (if multiple superclasses): shared property restrictions consistent → logic_rules.md §Classification Logic
- [ ] Existing instances needing reclassification identified
- [ ] rdfs:label, rdfs:comment provided → structure_spec.md §Naming Conventions
- [ ] Reasoner: no unsatisfiable classes → logic_rules.md §Description Logic Inference Patterns
- [ ] Not orphaned: ≥1 property/relation → structure_spec.md §Isolated Node Prohibition

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Modify | §Classification Criteria Design, §Hierarchy Structure Principles |
| logic_rules.md | Verify | §Classification Logic, §Description Logic Inference Patterns |
| concepts.md | Potential | New term definition |
| dependency_rules.md | Verify | §Inter-Class Dependencies (DAG acyclicity) |

---

## Case 2: Adding Properties/Relations

### Situation

Adding a new property or relation between classes. Domain/range must be consistent; cardinality must not conflict with existing constraints.

### Case Study: Schema.org — "actionStatus" on Action type

Adding `actionStatus` (range: `ActionStatusType` enumeration) to Action required domain/range verification across 150+ subtypes. Without formal cardinality constraints under OWA, consumers could not determine single vs. multiple status values. Applications assuming single-status broke with multi-value providers.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | Property is a new entity needing domain, range, logical characteristics |
| Relation structure | Domain/range must reference existing classes (structure_spec.md §Golden Relationships) |
| Classification consistency | rdfs:domain causes type inference — verify intent (logic_rules.md §Constraint Logic) |
| Constraint validity | Cardinality must not conflict with superclass (logic_rules.md §Constraint Conflict Checking) |
| Interoperability | Alignment declarations may need updating for semantic overlap |

### Verification Checklist

- [ ] Domain/range reference existing classes → structure_spec.md §Golden Relationships
- [ ] No cardinality contradiction with superclass → logic_rules.md §Constraint Conflict Checking (type 2)
- [ ] Domain inference is intended → logic_rules.md §Constraint Logic
- [ ] Inverse property coherence → dependency_rules.md §Inter-Property Dependencies
- [ ] Property chain validity → dependency_rules.md §Inter-Property Dependencies
- [ ] No unintended inferences → logic_rules.md §Description Logic Inference Patterns
- [ ] Profile conformance → logic_rules.md §OWL 2 Profile Expressivity Rules

### Affected Files

| File | Impact | Section |
|---|---|---|
| logic_rules.md | Verify | §Constraint Logic, §Constraint Conflict Checking, §Reasoning Logic |
| dependency_rules.md | Modify | §Inter-Property Dependencies |
| structure_spec.md | Verify | §Golden Relationships, §Required Relations |
| concepts.md | Potential | New property term definition |

---

## Case 3: External Ontology Integration

### Situation

Importing an external ontology via owl:imports or adding alignment mappings for interoperability.

### Case Study: FIBO — 20+ external vocabulary integration

FIBO integrates Dublin Core, SKOS, PROV-O, LCC into a 1,400+ class financial ontology. Dublin Core's dct:date range (rdfs:Literal) conflicted with FIBO's OWL Time (time:Instant). Import chain depth exceeded 4 levels, causing HermiT performance issues. Addressed with "load profiles" (minimal import sets per module) and pre-computed import closures.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | External classes may overlap with or contradict internal definitions |
| Relation structure | Imported relations interact with internal ones; semantic overlap creates ambiguity |
| Classification consistency | External classification axes may differ from internal ones |
| Constraint validity | External + internal axioms form one logical theory (dependency_rules.md §Inter-Ontology Dependencies) |
| Interoperability | Mapping accuracy critical: owl:equivalentClass vs skos:closeMatch |

### Verification Checklist

- [ ] No URI namespace collisions
- [ ] Import depth ≤ 3 → structure_spec.md §Quantitative Thresholds
- [ ] No axiom contradictions → logic_rules.md §Constraint Conflict Checking (type 4)
- [ ] Mapping is semantic, not just lexical → dependency_rules.md §Alignment vs Integration
- [ ] Version-specific URI pinned → dependency_rules.md §OWL Imports Chain Management
- [ ] License compatible → dependency_rules.md §External Dependency Management
- [ ] Combined axioms don't cause reasoner timeout
- [ ] No circular imports → dependency_rules.md §OWL Imports Chain Management

### Affected Files

| File | Impact | Section |
|---|---|---|
| dependency_rules.md | Modify | §Inter-Ontology Dependencies, §OWL Imports Chain Management, §External Dependency Management |
| logic_rules.md | Verify | §Constraint Conflict Checking (type 4) |
| structure_spec.md | Verify | §Modularization Patterns, §Quantitative Thresholds |
| domain_scope.md | Verify | §Reference Standards/Frameworks |

---

## Case 4: Constraint Tightening/Relaxation

### Situation

Changing cardinality (optional → required), adding disjoint declarations, or modifying domain/range. Changes propagate to subclasses and affect all existing instances.

### Case Study: SNOMED CT — Sufficient definition requirements

SNOMED CT imposed "sufficient definition" requirements on 350K+ concepts. Fully defined concepts needed axioms both necessary and sufficient for automated classification. 10,000+ concepts required reclassification — either becoming fully defined or explicitly marked as "primitive." The process spanned multiple release cycles with automated QA pipelines.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | Existing classes may need additional axioms |
| Relation structure | Narrowed domain/range may cause inference conflicts (logic_rules.md §Constraint Conflict Checking, type 3) |
| Classification consistency | Tightened disjointness reveals previously tolerated overlaps as contradictions |
| Constraint validity | Subclasses inherit changes; relaxation = is-a violation (structure_spec.md §Hierarchy Structure Principles) |
| Interoperability | External data may violate tightened constraints — breaking change |

### Verification Checklist

- [ ] (Tightening) Existing instances satisfy new constraints → structure_spec.md §Golden Relationships
- [ ] (Relaxation) No unintended instances permitted → logic_rules.md §Constraint Logic
- [ ] Subclass propagation scope documented → dependency_rules.md §Direction Rules
- [ ] No cardinality contradiction → logic_rules.md §Constraint Conflict Checking (type 2)
- [ ] No domain/range disjointness contradiction → logic_rules.md §Constraint Conflict Checking (type 3)
- [ ] Closure axiom present if enumeration tightened → logic_rules.md §Constraint Logic
- [ ] SHACL shapes updated → logic_rules.md §SHACL Validation Logic
- [ ] Migration path provided if patterns invalidated → dependency_rules.md §Version Dependency Management

### Affected Files

| File | Impact | Section |
|---|---|---|
| logic_rules.md | Modify | §Constraint Logic, §Constraint Conflict Checking, §SHACL Validation Logic |
| structure_spec.md | Verify | §Golden Relationships, §Hierarchy Structure Principles |
| dependency_rules.md | Verify | §Direction Rules, §Version Dependency Management |

---

## Case 5: Ontology Type Transition

### Situation

Transitioning between lightweight (Taxonomy, SKOS) and formal (OWL) ontology, or vice versa. Changes fundamental assumptions (OWA/CWA, inference behavior).

### Case Study: DBpedia — RDFS to OWL transition

DBpedia added OWL axioms (disjointness, domain/range restrictions) to its RDFS knowledge graph. Under RDFS, triples were simply stored. Under OWL, domain/range inferred types. Adding `Person owl:disjointWith Place` made instances categorized under both inconsistent. SPARQL FILTER NOT EXISTS (CWA) produced different results under OWL's OWA. DBpedia maintained two endpoints: one without reasoning, one OWL-aware.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | skos:Concept must be remodeled as owl:Class or bridged |
| Relation structure | RDFS carries weaker semantics than OWL restrictions |
| Classification consistency | CWA→OWA changes classification behavior for every class |
| Constraint validity | Informal constraints not formalized are lost |
| Interoperability | SPARQL queries may break (logic_rules.md §Open World vs Closed World Reasoning) |

### Verification Checklist

- [ ] Information loss inventory: inexpressible axioms/constraints identified
- [ ] CWA↔OWA inference differences documented → logic_rules.md §Open World vs Closed World Reasoning
- [ ] SPARQL queries tested for broken patterns
- [ ] SKOS↔OWL entity remodeling explicit → concepts.md §Interpretation Principles
- [ ] Reasoner output compared before vs after
- [ ] OWL 2 profile selected → structure_spec.md §OWL 2 Profile Selection Criteria
- [ ] Downstream consumers notified

### Affected Files

| File | Impact | Section |
|---|---|---|
| domain_scope.md | Modify | §Ontology Type Classification |
| logic_rules.md | Modify | §Open World vs Closed World Reasoning, §OWL 2 Profile Expressivity Rules |
| structure_spec.md | Verify | §OWL 2 Profile Selection Criteria |
| concepts.md | Verify | §Interpretation Principles |

---

## Case 6: Scale Expansion

### Situation

10x classes, 100x instances, or substantial relation complexity growth. Tests structural design limits and reasoner capabilities.

### Case Study: Wikidata — 10M to 100M+ items

Wikidata grew from 10M items (2013) to 100M+ with 1.5B+ statements. Full OWL reasoning became impractical. Shifted to property-based constraint checking (SHACL-like). Hierarchy depth exceeded 20 levels in some branches. Cross-domain linking prevented clean modularization. Solution: curated "views" (domain-specific subsets) for downstream consumers.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | Quality varies at scale; automated metrics replace manual review |
| Relation structure | Relations grow faster than classes; property dependency graphs need tooling |
| Classification consistency | Axis discipline degrades with many contributors; automated detection needed |
| Constraint validity | Full reasoning may become intractable; partial validation replaces global checks |
| Interoperability | Curated subsets may replace full ontology for consumers |

### Verification Checklist

- [ ] Reasoner tractability within bounds → domain_scope.md §OWL 2 Profile Classification
- [ ] Hierarchy depth < 7, breadth < 30 siblings → structure_spec.md §Quantitative Thresholds
- [ ] Module size ≤ 500 classes → structure_spec.md §Quantitative Thresholds
- [ ] Modularizability assessed → structure_spec.md §Modularization Patterns
- [ ] Entity-relation ratio ≤ 3:1 → structure_spec.md §Quantitative Thresholds
- [ ] Orphan rate ≤ 10% → structure_spec.md §Quantitative Thresholds
- [ ] Import chain performance tracked → dependency_rules.md §OWL Imports Chain Management
- [ ] Partial validation strategy defined if needed → logic_rules.md §SHACL Validation Logic

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Modify | §Quantitative Thresholds, §Modularization Patterns |
| domain_scope.md | Verify | §OWL 2 Profile Classification |
| logic_rules.md | Verify | §SHACL Validation Logic |
| dependency_rules.md | Verify | §OWL Imports Chain Management |

---

## Case 7: Multilingual/Multicultural Expansion

### Situation

Applying the ontology to a new language or cultural context. Involves multilingual label management, cultural concept mapping, and URI language-independence.

### Case Study: Wikidata — 400+ language support

Wikidata uses language-neutral Q-identifiers (Q42 = Douglas Adams), avoiding DBpedia's English URI problem (dbr:Munich vs dbr:München). Cultural mapping challenges: Japanese addresses (都道府県 → 市区町村 → 番地) are a different spatial decomposition, not a translation of "state → city → street" — Wikidata uses distinct properties per system. Korean kinship (외삼촌 vs 삼촌) requires separate classes even when some languages lack the distinction.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | Culturally distinct concepts require new classes — translation is not always possible |
| Relation structure | URIs are language-independent; culture-specific concepts may need new relations |
| Classification consistency | MECE in one culture may not be MECE in another |
| Constraint validity | Must be culturally general ("exactly one familyName" fails for mononymous cultures) |
| Interoperability | skos:exactMatch may be inaccurate across culturally distinct concepts |

### Verification Checklist

- [ ] URIs language-independent → structure_spec.md §Naming Conventions
- [ ] All classes/properties have rdfs:label with language tags → structure_spec.md §Golden Relationships
- [ ] SKOS labels (prefLabel/altLabel/hiddenLabel) used correctly → domain_scope.md §Glossary
- [ ] Concepts with culture-dependent classification documented
- [ ] Constraints verified against all target cultures
- [ ] exactMatch only for true equivalence; closeMatch for approximations

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Modify | §Naming Conventions |
| concepts.md | Modify | §Synonym and Inclusion Relationships |
| domain_scope.md | Verify | §Major Sub-areas > Core > Glossary |
| logic_rules.md | Verify | §Naming Logic |

---

## Case 8: Ontology Modularization

### Situation

Splitting a monolithic ontology into independently loadable modules. Triggered when a module exceeds 500 classes or sub-domains need independent evolution.

### Case Study: OBO Foundry — Biomedical ontology modules

OBO Foundry coordinates 200+ ontologies: anatomy (Uberon), phenotype (HPO), disease (DOID), gene function (GO), chemicals (ChEBI). All share BFO (Basic Formal Ontology) as upper ontology. Cross-domain links use bridge ontologies. The MIREOT principle imports only specific terms (not entire modules) to reduce axiom bloat. Without modularization, a unified biomedical ontology of 2M+ classes would be unprocessable.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | Each entity has exactly one home module; cross-references use imported URIs |
| Relation structure | Cross-boundary relations create inter-module coupling |
| Classification consistency | Each module maintains own axis; upper ontology provides top-level axes |
| Constraint validity | Constraints on imported classes break if imported module changes |
| Interoperability | Selective import enables consumers to load only needed modules |

### Verification Checklist

- [ ] High cohesion, low coupling at module boundaries → structure_spec.md §Modularization Patterns
- [ ] No circular imports → dependency_rules.md §OWL Imports Chain Management
- [ ] Import depth ≤ 3 → structure_spec.md §Quantitative Thresholds
- [ ] Module size ≤ 500 classes → structure_spec.md §Quantitative Thresholds
- [ ] Every class/property has one home module — no duplicates
- [ ] Upper ontology pattern applied → structure_spec.md §Modularization Patterns
- [ ] Bridge ontologies for cross-domain alignment → dependency_rules.md §Alignment vs Integration
- [ ] Each module loads/reasons independently without errors

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Modify | §Modularization Patterns, §Quantitative Thresholds |
| dependency_rules.md | Modify | §OWL Imports Chain Management, §Circular Dependency Resolution (Pattern 3) |
| logic_rules.md | Verify | §Constraint Conflict Checking (type 4) |
| domain_scope.md | Verify | §Required Concept Categories (modularity boundaries) |

---

## Case 9: Ontology Merging

### Situation

Merging independently developed ontologies covering overlapping domains into a single ontology. Unlike integration (Case 3), the goal is one merged ontology.

### Case Study: Gene Ontology — Three independent ontologies merged

GO merged Biological Process, Molecular Function, and Cellular Component — each with different classification axes (function, activity, location) and relation patterns ("regulates" vs "part_of"). Concept alignment was needed: "cell death" appeared in two sub-ontologies with different semantics. Solution: three top-level branches under a shared root, linked by cross-branch relations ("occurs_in", "is_part_of").

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | Duplicates: merge (identical), differentiate (distinct), or deprecate |
| Relation structure | Different vocabularies for same relationship create redundancy |
| Classification consistency | Different axes need coherent multi-axis structure or separate branches |
| Constraint validity | Contradictory disjointness is the most common conflict |
| Interoperability | Original URIs must remain valid or be deprecated |

### Verification Checklist

- [ ] Every source concept mapped to merged concept → dependency_rules.md §Alignment vs Integration
- [ ] Lexically similar concepts evaluated for semantic identity → logic_rules.md §Naming Logic
- [ ] Relation types unified or differentiated
- [ ] Constraint conflicts resolved → logic_rules.md §Constraint Conflict Checking
- [ ] Namespace unified or multi-namespace documented → structure_spec.md §Ontology Structure Required Elements
- [ ] Original URIs preserved or deprecated → dependency_rules.md §Version Dependency Management
- [ ] No unsatisfiable classes → logic_rules.md §Description Logic Inference Patterns
- [ ] Classification axes documented → structure_spec.md §Classification Criteria Design

### Affected Files

| File | Impact | Section |
|---|---|---|
| dependency_rules.md | Modify | §Alignment vs Integration, §Referential Integrity, §Version Dependency Management |
| concepts.md | Modify | §Homonyms Requiring Attention, §Synonym and Inclusion Relationships |
| logic_rules.md | Modify | §Constraint Conflict Checking, §Naming Logic |
| structure_spec.md | Verify | §Classification Criteria Design |

---

## Case 10: Profile Migration

### Situation

Moving from one OWL 2 profile to another (e.g., EL → DL or DL → EL). Changes allowed constructs and reasoning guarantees.

### Case Study: SNOMED CT — EL++ with DL extension layer

SNOMED CT uses OWL 2 EL for polynomial-time classification of 350K+ concepts. Clinical modeling needed unavailable constructs (universal restrictions, negation, disjunction). The team explored a DL extension layer importing the EL core. Challenge: DL inferences cannot propagate back without violating EL constraints. Solution: strict boundary — EL core is self-contained for classification; DL layer provides supplementary inferences for DL-capable consumers only.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | Class definitions may need rewriting for target profile constructs |
| Relation structure | Profile restricts property characteristics (EL: no universal; QL: no transitivity) |
| Classification consistency | Inferred hierarchies differ by profile |
| Constraint validity | Constructs must be valid in target profile (logic_rules.md §OWL 2 Profile Expressivity Rules) |
| Interoperability | Profile-specific consumers may lose access to inferences |

### Verification Checklist

- [ ] Inferred hierarchy preserved (upgrade) or differences documented (downgrade)
- [ ] All axioms conform to target profile → logic_rules.md §OWL 2 Profile Expressivity Rules
- [ ] Unavailable constructs identified with resolution plans → domain_scope.md §OWL 2 Profile Classification
- [ ] Reasoner supports target profile
- [ ] Decidability documented → domain_scope.md §OWL 2 Profile Classification
- [ ] Reasoning performance within bounds
- [ ] Downstream consumers notified

### Affected Files

| File | Impact | Section |
|---|---|---|
| domain_scope.md | Modify | §OWL 2 Profile Classification |
| logic_rules.md | Modify | §OWL 2 Profile Expressivity Rules, §Description Logic Inference Patterns |
| structure_spec.md | Verify | §OWL 2 Profile Selection Criteria |
| dependency_rules.md | Verify | §Version Dependency Management |

---

## Case 11: Deprecation and Migration

### Situation

Removing outdated or incorrect concepts while preserving backward compatibility for external references.

### Case Study: Schema.org — "ProductModel" deprecation

Schema.org deprecated `ProductModel` in favor of `Product` + `model` property. Multi-year migration: (1) marked deprecated, parsers still recognized it; (2) documentation recommended new pattern; (3) Google's testing tool showed warnings not errors; (4) after two years, moved to "pending" layer. URI `schema.org/ProductModel` continued to resolve with deprecation metadata. Key lesson: in decentralized ecosystems, deprecation must be gradual with explicit replacement guidance.

### Impact Analysis

| Principle | Impact |
|---|---|
| Entity definitions | Retained with owl:deprecated; replacement must be identified |
| Relation structure | Properties with deprecated class as domain/range need updates |
| Classification consistency | Removing from disjoint union invalidates partition |
| Constraint validity | Constraints on deprecated entity remain active until removal |
| Interoperability | External references become dangling after removal |

### Verification Checklist

- [ ] All internal references identified (subclass, domain, range, instances, chains, shapes) → dependency_rules.md §Referential Integrity
- [ ] Replacement documented in rdfs:comment → dependency_rules.md §Version Dependency Management
- [ ] Retained ≥ 1 version cycle → dependency_rules.md §Version Dependency Management
- [ ] `owl:deprecated "true"^^xsd:boolean` applied → dependency_rules.md §Version Dependency Management
- [ ] Disjoint union updated if member → logic_rules.md §Classification Logic
- [ ] External consumers notified
- [ ] Replacement handles all original use cases
- [ ] Deprecated URI continues to resolve

### Affected Files

| File | Impact | Section |
|---|---|---|
| dependency_rules.md | Modify | §Version Dependency Management, §Referential Integrity |
| concepts.md | Modify | Deprecated term with marking and replacement |
| logic_rules.md | Verify | §Classification Logic, §Naming Logic |
| structure_spec.md | Verify | §Golden Relationships |

---

## Scenario Interconnections

Extension scenarios are not independent. Multiple scenarios often occur simultaneously or trigger each other.

| Scenario | Triggers / Interacts With | Reason |
|---|---|---|
| Case 1 (New Class) | → Case 4 (Constraint Tightening) | New class may require tighter constraints for partition completeness |
| Case 1 (New Class) | → Case 11 (Deprecation) | New class may replace a deprecated class |
| Case 2 (New Properties) | → Case 4 (Constraint Tightening) | New properties may require cardinality constraints |
| Case 3 (External Integration) | → Case 8 (Modularization) | Importing increases axiom count, may trigger modularization |
| Case 3 (External Integration) | → Case 9 (Merging) | Deep integration may evolve into full merge |
| Case 4 (Constraint Tightening) | → Case 11 (Deprecation) | Tightened constraints may invalidate concepts |
| Case 5 (Type Transition) | → Case 10 (Profile Migration) | RDFS→OWL necessarily involves profile selection |
| Case 5 (Type Transition) | → Case 2 (New Properties) | Formal ontologies require explicit property definitions |
| Case 6 (Scale Expansion) | → Case 8 (Modularization) | Scale beyond 500-class threshold triggers modularization |
| Case 6 (Scale Expansion) | → Case 10 (Profile Migration) | Scale may require DL→EL for tractable reasoning |
| Case 7 (Multilingual) | → Case 9 (Merging) | May require merging locale-specific ontologies |
| Case 7 (Multilingual) | → Case 1 (New Class) | Cultural concepts need new classes, not just labels |
| Case 8 (Modularization) | → Case 3 (External Integration) | owl:imports creates same dependency challenges |
| Case 9 (Merging) | → Case 4 (Constraint Tightening) | Conflicting constraints resolved by tightening |
| Case 9 (Merging) | → Case 11 (Deprecation) | Duplicate concepts require deprecating one |
| Case 10 (Profile Migration) | → Case 2 (New Properties) | More expressive profile enables new property types |
| Case 11 (Deprecation) | → Case 1 (New Class) | Deprecated concept replaced by new class |

---

## Related Documents
- structure_spec.md — class hierarchy, classification criteria, naming conventions, modularization, thresholds
- dependency_rules.md — inter-ontology dependencies, import chains, version management, deprecation
- logic_rules.md — classification logic, constraint logic, reasoning, profiles, SHACL validation
- domain_scope.md — ontology type classification, OWL 2 profiles, bias detection
- concepts.md — glossary, interpretation principles, relation types
