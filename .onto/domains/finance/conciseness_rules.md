---
version: 1
last_updated: "2026-03-29"
source: bundled-domain-baseline
status: established
---

# Conciseness Rules (finance)

This document contains the domain-specific rules that conciseness references during conciseness verification.
It is organized in the order: **type (allow/remove) -> verification criteria -> role boundaries -> measurement methods**.

---

## 1. Allowed Redundancy

Each rule is tagged with a severity level:
- **[MUST-ALLOW]**: Redundancy that breaks the system if removed. Must be retained.
- **[MAY-ALLOW]**: Redundancy kept for convenience. Can be consolidated, but only remove when the benefit clearly outweighs the consolidation cost.

### Reporting Unit Related

- [MUST-ALLOW] Parallel consolidated and separate financial statements — the same account (e.g., revenue) exists in both consolidated and separate bases. The consolidated scope includes subsidiary aggregation and intercompany elimination, so the figures and meaning differ from separate. Removing either makes inter-reporting-unit comparison and consolidation adjustment verification impossible.
- [MUST-ALLOW] Parallel segment reporting and consolidated totals — segment-level revenue and operating income are components of consolidated totals, but intercompany transactions between segments and unallocated items mean they do not simply sum to the total. Removing segment figures makes divisional performance analysis impossible.

### Temporal Attribute Related

- [MUST-ALLOW] Dual classification of instant/duration attributes — even for the same account, instant (point-in-time) and duration (period) items have different temporal attribution. Example: Cash and cash equivalents is expressed as instant (closing balance) on the Statement of Financial Position and as duration (period change) on the Cash Flow Statement. Consolidating into a single attribute causes loss of temporal dimension information.
- [MAY-ALLOW] Parallel presentation of opening and closing balances for Statement of Financial Position items — prior period-end (opening) and current period-end (closing) balances are displayed simultaneously for comparison purposes. The same figures can be referenced from prior period financial statements, but retain for comparison readability purposes.

### Account Classification Related

- [MUST-ALLOW] Dual existence of the same account due to current/non-current classification — other financial assets split into current and non-current are separate Facts because their maturity/recovery periods differ. Consolidation makes liquidity analysis impossible.
- [MAY-ALLOW] Parallel presentation of labels and taxonomy element IDs — the taxonomy element ID is the primary identifier, but labels are retained for human readability. If only labels exist without taxonomy IDs, they are removal targets.

### External Reference Related

- [MUST-ALLOW] Parallel IFRS taxonomy mapping and FIBO mapping — the same concept is mapped to both IFRS taxonomy and FIBO. The two standards have different purposes (financial reporting vs. financial industry ontology) and structures, so they cannot be consolidated into a single mapping.
- [MAY-ALLOW] Parallel company extension accounts and standard taxonomy accounts — per the original preservation principle, company-specific labels are retained while also mapped to canonical names. However, if the extension account is completely identical to the standard account with no additional information, consolidation is possible.

---

## 2. Removal Target Patterns

Each rule is tagged with a severity level:
- **[MUST-REMOVE]**: Redundancy whose mere existence causes errors or incorrect inferences.
- **[SHOULD-REMOVE]**: Redundancy that is not very harmful but adds unnecessary complexity.

### Taxonomy Redundancy

- [MUST-REMOVE] Duplicate definition of multiple labels for the same taxonomy element as separate concepts — when several labels (e.g., "Revenue," "Sales," "Operating revenue") for a single taxonomy element ID are registered as separate concepts, use the synonym mappings in concepts.md to retain only the canonical name. Treating multiple labels as separate concepts causes double-counting in aggregation and comparison.
- [MUST-REMOVE] Creating extension accounts that duplicate accounts already existing in the standard taxonomy — when an extension element exists with the same meaning and constraints as a standard element, mapping inconsistencies arise. Use the standard element first.

### Relation Redundancy

- [MUST-REMOVE] Multiple path aggregation between the same accounts — example: when both a current assets subtotal -> total assets path and individual current asset items -> total assets direct path exist simultaneously, aggregation logic is applied twice, causing amount inconsistencies.
- [SHOULD-REMOVE] Explicit redeclaration of relationships already guaranteed by accounting identities — when Assets = Liabilities + Equity is guaranteed in logic_rules.md, there is no need to separately redefine "equity is assets minus liabilities" as a separate relationship on individual nodes.

### Classification Redundancy

- [SHOULD-REMOVE] Intermediate classification nodes with only 1 child account — example: when only a single item exists under "Other non-current assets," merge the intermediate node with the parent. However, retain if reserved for future expansion (see extension_cases.md).
- [SHOULD-REMOVE] Classification nodes with no actual amount data (Facts) — empty account classifications unused by any reporting entity should be removed. However, retain if they are mandatory elements of the standard taxonomy.

### Definition Redundancy

- [MUST-REMOVE] Multiple calculation path definitions for the same derived metric — example: when ROE is simultaneously defined as "net income / total equity" and "net income / average equity," the results differ. Designate one definition as the authoritative version.
- [SHOULD-REMOVE] Same verification logic (e.g., identity verification) copied across multiple financial statement modules — extraction to a common verification module is needed.

---

## 3. Minimum Granularity Criteria

A sub-classification is permitted only if it satisfies **at least one** of the following. If none are satisfied, merge with the parent.

1. **Competency question difference**: Does it generate a different answer to a question in competency_qs.md?
2. **Constraint difference**: Do different constraints (temporal attribute, current/non-current classification, normal balance direction, cardinality) apply?
3. **Dependency difference**: Does it belong to a different financial statement, segment, or reporting unit, or map to a different taxonomy element?

Examples:
- `Current other financial assets` and `Non-current other financial assets` are justified as separate classifications because different constraints (1-year maturity criterion, liquidity classification) apply.
- If `Total assets` and `Assets total` both map to the same taxonomy element (ifrs:Assets) with the same constraints, they are candidates for merging.

---

## 4. Boundaries — Domain-Specific Application Cases

The authoritative source for boundary definitions is `roles/conciseness.md`. This section describes only the specific application cases in the finance domain.

### pragmatics boundary

- conciseness: Does an unnecessary element **exist**? (structural level)
- pragmatics: Does unnecessary information **hinder** query execution? (execution level)
- Example: Unused note items are included in financial statement query responses -> pragmatics. Unused accounts are defined in the taxonomy structure -> conciseness.

### coverage boundary

- conciseness: Does something exist that should not? (reduction direction)
- coverage: Is something missing that should exist? (expansion direction)
- Example: Notes system is missing, making accounting policy disclosure impossible -> coverage. The same accounting policy is duplicated across multiple notes -> conciseness.

### logic boundary (predecessor/successor relationship)

- logic predecessor: determines logical equivalence (entailment)
- conciseness successor: decides whether to remove after equivalence is confirmed
- Example: The accounting identity (Assets = Liabilities + Equity) already entails the definition of equity -> logic determines equivalence -> conciseness determines "separate calculation relationship redeclaration for equity is unnecessary."

### semantics boundary (predecessor/successor relationship)

- semantics predecessor: determines semantic identity (synonym status)
- conciseness successor: decides whether merging is needed after synonym confirmation
- Example: "Revenue"/"Sales"/"Operating revenue" are the same taxonomy element -> semantics determines they are synonyms -> conciseness determines "consolidate to a single canonical name."

---

## 5. Quantitative Criteria

Domain-observed thresholds for conciseness judgment. Each threshold is a review signal, not an automatic removal trigger.

### Taxonomy Redundancy Thresholds

- **Multiple labels per element**: same taxonomy element ID with 3+ different labels → consolidate to canonical name. Two labels may reflect legitimate regional variation; three almost certainly duplicates. (concepts.md §Core Synonym Mappings)
- **Extension account ratio**: if >30% of an entity's accounts are extensions, review for over-extension. Many extensions may map to existing standard elements. (concepts.md §Extension Account Handling)
- **Unused standard elements**: if >50% of standard taxonomy elements in a jurisdiction have zero usage across all entities → informational (valid placeholders, not removal targets)

### Structural Redundancy Thresholds

- **Intermediate hierarchy nodes**: node with exactly 1 child for >2 reporting periods → merge candidate. Exception: reserved by taxonomy standard
- **Duplicate aggregation paths**: if the same account is reachable through 2+ aggregation paths → review for path consolidation. One canonical path must be designated
- **Orphan notes**: notes extracted but linked to zero FinancialFacts → review for linkage error or removal. Notes from unstructured sources are most prone to this

### Derived Metric Redundancy

- **Multiple formula definitions**: same derived metric (e.g., ROE) defined with 2+ different formulas → consolidate to one authoritative definition. Document the formula choice rationale. (logic_rules.md §Derived Metric Calculation Rules)
- **Cached vs computed metrics**: if a derived metric is stored both as a precomputed value and computable from underlying data → prefer on-demand computation. Store only when computation cost is prohibitive

### Cross-Tier Duplication

- **Tier-2/Tier-3 overlap**: same metric defined as both a taxonomy element (Tier-2) and an analytical convention (Tier-3) → consolidate to Tier-2 when the taxonomy element matches exactly. Retain Tier-3 separately only when the computation differs (e.g., "adjusted EBITDA" vs taxonomy operating income)

### Review Output Conciseness

- **Finding deduplication**: 3+ findings citing the same root cause (e.g., multiple extension accounts mapping to the same standard element) → consolidate into 1 finding with root cause + all affected accounts
- **Cross-file deduplication**: issue flagged by both conciseness and a preceding agent (logic or semantics) → defer to the preceding agent's finding; add only the consolidation recommendation

---

## Related Documents

- `concepts.md` — Term definitions, synonym mappings, homonym lists, extension account handling (semantic criteria for redundancy determination)
- `structure_spec.md` — Isolated node rules, required relationships, ID system (structural removal criteria)
- `competency_qs.md` — CQ-ID sections for minimum granularity judgment
- `domain_scope.md` — Normative system classification (Tier system), cross-cutting concerns
- `dependency_rules.md` — External standard reference rules, source of truth management (basis for allowing parallel mappings)
- `logic_rules.md` — Accounting identities, derived metric formulas (criteria for logical equivalence determination)
- `extension_cases.md` — Taxonomy change and extension account scenarios (basis for classification node retain/remove decisions)
