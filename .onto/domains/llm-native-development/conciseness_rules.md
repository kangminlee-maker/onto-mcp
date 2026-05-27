---
version: 2
last_updated: "2026-05-27"
source: manual
status: established
---

# Conciseness Rules (llm-native-development)

This document contains the domain-specific rules that conciseness references during conciseness verification.
It is organized in the order of **type (allow/remove) → verification criteria → role boundaries → measurement method**.

---

## 1. Allowed Duplication

Each rule is tagged with a strength level:
- **[MUST-ALLOW]**: Duplication that breaks the system if removed. Must be retained.
- **[MAY-ALLOW]**: Duplication retained for convenience. Can be consolidated, but only remove when the benefit clearly outweighs the consolidation cost.

### Traceability

- [MUST-ALLOW] Spec → implementation → frontmatter triple traceability — spec.md requirements, implementation file code, and frontmatter metadata express the same facts in different formats. The three layers have different consumers (human judgment, LLM generation, machine verification), so removing any one severs the traceability chain.
- [MUST-ALLOW] AI/human dual consumption paths — The same information coexists in human-facing documents (README, explanatory text) and LLM-facing structures (frontmatter, system map). Since consumers read differently, consolidation destroys accessibility for one side.

### Navigation Structure

- [MUST-ALLOW] File list overlap between system map (ARCHITECTURE.md) and navigation index (INDEX.md) — The system map provides a structural overview of the whole, while the navigation index provides per-directory detail. Since their purposes and navigation depth differ, independent maintenance is mandatory.
- [MAY-ALLOW] Frontmatter relationship declarations and body "Related Documents" links pointing to the same file. Frontmatter is for machine verification, body links are for human navigation, so retention is acceptable, but there is a risk of inconsistency during updates.

### Role and Domain Document (Role-Document Mapping)

- [MUST-ALLOW] Agent role definitions (roles/*.md) and process document (process.md) role-document mapping both mentioning role names. Role files define judgment criteria while process documents define execution order, so their concerns differ.
- [MAY-ALLOW] The same file (e.g., concepts.md) appearing in multiple agents' domain document lists. If the reference context differs per agent, retain; if it is mere listing, extraction into a common reference is possible.

### Learning and Promotion

- [MAY-ALLOW] The same content temporarily coexisting in project learning items and promoted domain documents. Project learning items should be removed after promotion is complete, but temporary duplication during the promotion process is allowed.

### Model and Configuration Overlap (→Area 1, Area 4)

- [MUST-ALLOW] Model fallback configuration overlap: A model routing table (→Area 1: Model Integration) and an agent tool configuration (→Area 4: Agentic Systems) may both reference the same model identifier. The routing table determines which model to call and when to fall back, while the agent configuration determines which model the agent is permitted to use for tool calls. Different consumers (router vs agent) justify the duplication — removing either breaks its consumer's decision logic.

### Safety Defense-in-Depth (→Area 2, Area 6)

- [MUST-ALLOW] Safety policy in prompt and guardrails: The same safety rule may appear in both the system prompt (→Area 2: Prompt & Context Design) and the output guardrail layer (→Area 6: Safety & Alignment). The system prompt constrains model generation behavior, while the guardrail filters the output post-generation. This is defense-in-depth — removing the prompt-side rule increases the chance of harmful generation; removing the guardrail-side rule removes the safety net when prompt-side prevention fails.

### Evaluation and Operations Threshold Overlap (→Area 5, Area 7)

- [MAY-ALLOW] Evaluation criteria in Area 5 and monitoring thresholds in Area 7: Both reference quality thresholds (e.g., hallucination rate, response relevance score), but they serve different lifecycle stages. Area 5 (Evaluation & Testing) applies thresholds pre-deployment to determine release readiness, while Area 7 (Production Operations) applies thresholds at runtime to trigger alerts and rollback. Consolidation into a shared threshold definition is preferred, but independent maintenance is acceptable when evaluation and operations teams have different update cadences.

---

## 2. Removal Target Patterns

Each rule is tagged with a strength level:
- **[MUST-REMOVE]**: Duplication whose existence causes errors or incorrect reasoning.
- **[SHOULD-REMOVE]**: Duplication that is not significantly harmful but adds unnecessary complexity.

### Role Duplication

- [MUST-REMOVE] Duplicate agent definitions for the same role — Agents with different names but identical judgment criteria and assigned documents existing in 2 or more instances. Maintaining both causes verification result conflicts or unnecessary repeated execution.
- [SHOULD-REMOVE] Judgment criteria duplicately described in both role definition files and process documents — The authoritative source for judgment criteria is the role definition file, so process documents should reference only the role name.

### Navigation and History Mixing

- [MUST-REMOVE] Change history mixed into navigation index — INDEX.md describing both file lists (navigation) and change logs (history). Since navigation structure and change history have different update cycles and consumption purposes, separation is mandatory.
- [SHOULD-REMOVE] Change history fields and navigation relationship fields mixed in frontmatter — Frontmatter describes current-state metadata, so change history should be delegated to git or a separate history file.
- [MUST-REMOVE] Backward-compatibility notes, deprecated behavior, migration rationale, and historical alternatives in documents loaded for current execution — These materials inflate model context with non-current behavior. Keep execution context focused on current behavior, current contracts, current authority, and current failure handling; place historical material in isolated archive, deprecated, or development-record paths and link only when a task needs that history.

### Structural Duplication

- [MUST-REMOVE] Multiple paths to the same concept file — The same concept existing in different directories under different filenames. By the "File = Concept" equation, one concept must be expressed as exactly one file.
- [SHOULD-REMOVE] System map structural descriptions that list only information completely identical to individual file frontmatter — The system map should show overviews and relationships; simple copies of frontmatter cause update omissions.

### Constraint Duplication

- [SHOULD-REMOVE] Rules from structure_spec.md re-described in individual file bodies — The authoritative source for constraints is structure_spec.md, so individual files should maintain only references.

### Tool and MCP Duplication (→Area 4)

- [MUST-REMOVE] Same tool defined in multiple MCP servers with identical schemas — The agent cannot deterministically select which server to call, producing inconsistent behavior across invocations. Consolidate into a single MCP server, or differentiate schemas if the tools genuinely serve different purposes.

### Prompt Template Duplication (→Area 2, Area 4)

- [MUST-REMOVE] Same prompt template defined in both Area 2 (prompt design) and Area 4 (agent instructions) — Violates single source of truth. When the template is updated in one location but not the other, the agent's behavior diverges from the intended design. Define the template in one authoritative location and reference it from the other.

### Metric Definition Duplication (→Area 5, Area 7)

- [SHOULD-REMOVE] Same evaluation metric computed in both Area 5 (evaluation pipeline) and Area 7 (monitoring) — Independent definition in both causes definition drift. Consolidate the metric definition (formula, thresholds, labels) into a shared location. Different computation frequencies (batch vs real-time) are acceptable.

---

## 3. Minimum Granularity Criteria

A sub-classification is allowed only if it satisfies **one or more** of the following. If none are satisfied, merge with the parent.

1. **Competency question difference**: Does it produce a different answer to a question in competency_qs.md? Each of the 8 sub-areas in domain_scope.md is designed to answer distinct competency questions — if two classifications answer the same question set, they are merge candidates.
2. **Constraint difference**: Do different rules from logic_rules.md or structure_spec.md apply? For example, Area 2 (Prompt & Context Design) has token budget constraints that do not apply to Area 1 (Model Integration), and Area 6 (Safety & Alignment) has compliance-specific constraints absent from Area 5 (Evaluation & Testing).
3. **Consumer difference**: Do different sub-areas consume the classification? A concept consumed only by Area 3 (Retrieval & Knowledge Systems) and a concept consumed only by Area 4 (Agentic Systems) justify separate classifications even if they appear similar, because their consumers apply different logic.

Examples:
- `Concept file` and `meta file` have different constraints (frontmatter schema, "File = Concept" equation applicability), so the classification is justified.
- If `navigation index` and `system map` list only the same files in the same directory with no additional information, they are candidates for merging.
- A "model capability assessment" concept consumed by Area 1 (routing decisions) and Area 5 (evaluation benchmarks) may justify separate classifications if the competency questions and constraints differ. If they are identical in both respects, consolidate.

---

## 4. Boundaries — Domain-Specific Application Cases

The authoritative source for boundary definitions is `roles/conciseness.md`. This section describes only the specific application cases in the llm-native-development domain.

### pragmatics Boundary

- conciseness: Does an unnecessary element **exist**? (structural level)
- pragmatics: Does unnecessary information **waste** the LLM's context window? (execution level)
- In the 8-area structure: conciseness asks "does this element need to exist in this area?" while pragmatics asks "does including this element in the current execution context consume tokens without contributing to the task?"
- Example: A deprecated concept file remains in the directory → conciseness. A valid but currently unnecessary file is included in the reference chain → pragmatics.
- Example (8-area): Agent config (→Area 4) embeds a full prompt template copy → conciseness. Agent loads unused MCP tool schemas → pragmatics.

### coverage Boundary

- conciseness: Is there something that should not be there? (reduction direction)
- coverage: Is there something missing that should be there? (expansion direction)
- In the 8-area structure: coverage checks whether all 8 areas are represented (missing area = gap), while conciseness checks whether any area contains duplicated or misplaced elements.
- Example: An agent role is defined but has no assigned domain document → coverage. Two agents with identical judgment criteria are defined → conciseness.
- Example (8-area): Area 5 has no evaluation methodology → coverage. Same metric defined in Area 5 and Area 7 with identical formulas → conciseness.

### logic Boundary (preceding/following relationship)

- logic precedes: Determines logical equivalence (implication)
- conciseness follows: Decides whether to remove after equivalence is confirmed
- In the 8-area structure: logic determines whether two rules across areas are logically equivalent; conciseness then decides whether one should be removed. Particularly relevant for cross-area constraints (e.g., Area 6 safety rule implied by Area 2 prompt instruction).
- Example: A rule in structure_spec.md implies a constraint in an individual file body → logic determines equivalence → conciseness determines "re-description in individual file is unnecessary."
- Example (8-area): Area 1 fallback rule "if X fails, use Y" and Area 4 agent config "try X first, then Y" → logic determines equivalence → conciseness removes the non-authoritative copy.

### semantics Boundary (preceding/following relationship)

- semantics precedes: Determines semantic identity (synonym status)
- conciseness follows: Decides whether merging is needed after synonym is confirmed
- In the 8-area structure: semantics identifies when two terms across different areas refer to the same concept; conciseness then decides whether to merge into a single canonical definition with cross-area references.
- Example: system map / architecture overview / structure guide are the same concept → semantics determines synonym → conciseness determines "consolidate into one canonical term."
- Example (8-area): "response quality score" (→Area 5) and "output quality metric" (→Area 7) are the same measurement → semantics determines synonym → conciseness consolidates the definition.

---

## 5. Quantitative Criteria

Thresholds observed in this domain are recorded as they accumulate.

- **Tool overlap threshold** (→Area 4): If 2 tools share >80% of their parameter schemas (measured by field name and type overlap), they are candidates for consolidation. Review whether they serve genuinely different purposes before removing.
- **Prompt template similarity** (→Area 2): If 2 prompt templates differ by <10% of tokens (measured by edit distance / max token count), they should be consolidated into a single parameterized template. The remaining differences should be expressed as template variables.
- (Additional thresholds are accumulated through reviews)

---

## Related Documents

- `concepts.md` — Term definitions, synonym mappings, homonym list (semantic criteria for duplication determination)
- `structure_spec.md` — Frontmatter specifications, file type classification (structural-perspective removal criteria)
- `competency_qs.md` — Competency question list (criteria for judging "actual difference" in minimum granularity)
- `dependency_rules.md` — Reference chains and direction rules (basis for allowing reference copies)
- `domain_scope.md` — Domain scope, required concept categories (scope reference for duplication determination)
