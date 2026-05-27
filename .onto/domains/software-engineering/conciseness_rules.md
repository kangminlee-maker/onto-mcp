---
version: 5
last_updated: "2026-05-28"
source: bundled-domain-baseline
status: established
---

# Conciseness Rules (software-engineering)

This document contains the domain-specific rules referenced by conciseness during conciseness verification.
It is organized in the order: **type (allow/remove) → verification criteria → role boundary → measurement method**.

---

## 1. Allowed Redundancy

Each rule is tagged with a strength level:
- **[MUST-ALLOW]**: Redundancy that, if removed, would break the system. Must be retained.
- **[MAY-ALLOW]**: Redundancy maintained for convenience. Can be consolidated, but only remove when the benefit clearly outweighs the consolidation cost.

### State Management

- [MUST-ALLOW] Multiple definitions of terminal state — transition events, projector branches, and allowed subsequent event lists each reference the state. Removing any one makes state transition consistency verification impossible.
- [MUST-ALLOW] In Event Sourcing systems, where the event schema and projection logic express the same domain fact in different formats. Events are immutable records and cannot be consolidated with projections.

### Source of Truth Related

- [MUST-ALLOW] When the source of truth resides in an external system, maintaining an internal reference copy (cache, synchronization copy). Removal makes external dependency tracking impossible.
- [MAY-ALLOW] Redefining external API schemas as internal types. Retain if the purpose is to isolate from external changes; remove if it is a simple copy.

### Contracts and Interfaces

- [MUST-ALLOW] Bilateral redeclaration of interface contracts — provider (server) and consumer (client) each define the contract. Removal makes independent verification impossible.
- [MAY-ALLOW] Error paths and happy paths describing the same data in different contexts. Retain for readability purposes; consolidate if completely redundant.

### Testing

- [MUST-ALLOW] Unit test and integration test for the same rule — different verification levels targeting the same logic. Unit tests verify correctness in isolation (mock dependencies, fast feedback); integration tests verify correctness under real conditions (real DB, network, environment). Real example: payment calculation unit-tested with mock DB (formula correctness) and integration-tested with real DB (data type handling, rounding, transactions). Removing either leaves a verification gap.

### API Contracts

- [MUST-ALLOW] OpenAPI specification and server-side validation for the same constraints — the spec serves consumers (documentation, code generation, contract testing), while server validation enforces at runtime. Real example: `maxLength: 100` in the OpenAPI spec and `if len(field) > 100: raise ValidationError` in the handler. Removing the spec breaks consumer tooling; removing the validation breaks runtime safety.

### Type Definitions

- [MAY-ALLOW] Client-side and server-side type definitions for the same API — client types are shaped for the consumer's needs (e.g., optional fields for partial updates, camelCase naming), while server types are shaped for internal processing (e.g., required fields after validation, snake_case naming). Retain when the two sides have genuinely different shapes or naming conventions. Consolidate when the types are identical and a shared schema (e.g., generated from OpenAPI or GraphQL) can serve both.

### Monitoring

- [MAY-ALLOW] Application-level and infrastructure-level metrics for the same quantity — application metrics (e.g., handler-measured latency, per-endpoint) and infrastructure metrics (e.g., load-balancer-measured latency, per-host) measure the same thing at different granularity and observation points. Retain when the difference matters for diagnosis; consolidate when identical and only one consumer uses them.

### LLM-Native Runtime and Evaluation

- [MUST-ALLOW] Safety policy in both prompt instructions and runtime guardrails — prompt instructions reduce unsafe generation; guardrails block unsafe output. This defense-in-depth duplication is justified when both copies point to the same authority.
- [MAY-ALLOW] Evaluation criteria in both an eval rubric and a release gate — the rubric defines semantic quality; the gate enforces release policy. Retain only when the gate references the rubric instead of redefining criteria.

### Review Concern Case Overlap

- [MUST-ALLOW] The same case evidence may appear under multiple review concerns when each concern asks a different question. Example: prompt injection can support logic (instruction authority), structure (context assembly seat), dependency (retrieval/source boundary), security (exfiltration), pragmatics (answerable CQ), and axiology (user/operator harm). Domain concern labels are not lens-addition proposals.
- [MUST-ALLOW] A principle may have separate CQ forms for deterministic correctness, semantic quality, dependency impact, and value tradeoff. Merge only when the questions have the same pass/fail evidence.
- [MAY-ALLOW] Repeating a short inference path across CQ and case docs is acceptable when it lets a lens use the case without loading a long narrative. Prefer references over copied definitions.

### Cross-cutting Concerns

- [MAY-ALLOW] Cross-cutting concerns (security, logging, authentication) appearing in multiple modules. Allowed under the separation of concerns (SoC) principle, but copy-paste of identical logic is a removal target.

---

## 2. Removal Target Patterns

Each rule is tagged with a strength level:
- **[MUST-REMOVE]**: Redundancy whose very existence causes errors or leads to incorrect reasoning.
- **[SHOULD-REMOVE]**: Redundancy that is not highly harmful but adds unnecessary complexity.

### Relationship Redundancy

- [MUST-REMOVE] Multiple-path expression of the same relationship — when A->B and A->C->B have the same meaning, retain only one path. Maintaining both causes inconsistency due to missed updates.
- [MUST-REMOVE] Subordinate redeclaration already guaranteed by a superordinate constraint — if the superordinate interface guarantees non-null, the subordinate implementation's redeclaration is unnecessary.

### Classification Redundancy

- [SHOULD-REMOVE] Intermediate hierarchy node with only 1 child — has no classification value, so merge with parent.
- [SHOULD-REMOVE] Classification node with no instances — remove empty classifications with no actual data. However, retain if reserved for future extension (see extension_cases.md).

### Definition Redundancy

- [MUST-REMOVE] Duplicate definition of the same concept under different paths/names — determine based on the Homonyms list in concepts.md §Homonyms Requiring Attention. Note: synonym detection requires cross-file term comparison; no dedicated synonym section exists. Use the Homonyms list in concepts.md as a starting reference.
- [SHOULD-REMOVE] Same verification logic copied across multiple modules — needs extraction into a common module.

### Dead Code and Feature Flags

- [MUST-REMOVE] Dead feature flags — flags fully rolled out (100% traffic) but not removed. Dead flags accumulate never-taken branches and risk accidental reactivation. Real example: Knight Capital Group (2012) lost $440M in 45 minutes when a dead flag was repurposed during deployment, reactivating retired trading code. Fix: remove the flag and its branches after rollout is confirmed stable.
- [MUST-REMOVE] Commented-out code in production — VCS preserves all historical code, so commented-out blocks serve no purpose except to confuse readers. Retrieve from git history if needed later.

### Over-Abstraction

- [SHOULD-REMOVE] Single-implementation interfaces — an interface with exactly one implementing class, created "for testability" or "future flexibility," that has remained single-implementation for an extended period. The interface adds indirection without providing polymorphism. Remove and depend on the concrete class; re-extract when a genuine second implementation arises (YAGNI principle).
- [SHOULD-REMOVE] Redundant null checks after type-system verification — when the type system guarantees non-null (e.g., non-optional type in TypeScript strict mode, `@NonNull` in Java), a runtime null check duplicates the guarantee without adding safety. Exception: retain checks at system boundaries (external API responses, deserialized data) where the type system cannot verify the actual value.

### LLM-Native Context Noise

- [MUST-REMOVE] Historical migration notes, deprecated domain split rationale, or old LLM-native domain instructions from active execution context — they inflate model context with non-current behavior. Keep them in development-records or archive paths and link only when needed.
- [MUST-REMOVE] Duplicate prompt templates in agent instructions and prompt-template files — the agent's behavior diverges when one copy changes. Keep one source of truth and reference it.
- [MUST-REMOVE] Multiple tools with overlapping descriptions and identical practical capability — agents choose non-deterministically unless routing rules distinguish the tools.
- [MUST-REMOVE] Hidden fallback descriptions that are not connected to diagnostic artifacts — they make failures look successful and increase investigation cost.
- [MUST-REMOVE] Multiple active definitions of LLM/runtime/middleware ownership, output trust, RAG permission, agent autonomy, or provenance. Keep the definition in concepts.md and express operational consequences in rules/CQs.
- [MUST-REMOVE] Case-study prose that does not yield a guideline, CQ seed, PASS, and FAIL criterion. Move historical narrative to archive/development records if it remains useful.

---

## 3. Minimum Granularity Criteria

A sub-classification is allowed only when it satisfies **one or more** of the following. If none are satisfied, merge with the parent.

1. **Competency question difference**: Does it produce a different answer to a question in competency_qs.md? The CQ-S (Structural Understanding), CQ-D (Data Flow), and CQ-T (Types and Constraints) question groups each target different verification concerns — if a sub-classification produces different answers in any of these groups, the classification is justified.
2. **Constraint difference**: Do different constraints (cardinality, type, range) apply? As defined in logic_rules.md 'Type System Logic' and structure_spec.md 'Required Relationships'.
3. **Dependency relationship difference**: Does it depend on different modules/systems, or do different modules/systems depend on it? As defined in dependency_rules.md 'Acyclic Dependencies' and 'Direction Rules'.

Examples:
- `HttpError` and `ValidationError` are justified as separate classifications because different constraints apply (HTTP status code vs field list), and they answer CQ-T questions differently (one relates to transport-layer type safety, the other to input-domain type safety).
- `InternalServerError` and `UnexpectedError` are merge candidates if they follow the same processing logic, answer the same competency questions, and have no constraint or dependency differences.

Anti-examples of premature classification:
- Splitting `UserRepository` into `ReadUserRepository` and `WriteUserRepository` before any consumer actually needs the separation — the split satisfies no competency question difference, no constraint difference, and no dependency difference. The two classes have the same dependents and dependencies. Wait until CQRS is actually adopted before splitting.
- Creating `BaseService`, `AbstractBaseService`, and `ConcreteService` hierarchy when there is only one service implementation — the intermediate nodes have no classification value and should be collapsed to a single class.

---

## 4. Boundaries — Domain-specific Application Cases

The authoritative source for boundary definitions is `roles/conciseness.md`. This section describes only the concrete application cases in the software-engineering domain.

### pragmatics Boundary

- conciseness: Does an unnecessary element **exist**? (structural level)
- pragmatics: Does unnecessary information **hinder** query execution? (execution level)
- Example: Unused fields included in API response → pragmatics. Unused entity defined in schema → conciseness.

### coverage Boundary

- conciseness: Does something that should not exist, exist? (reduction direction)
- coverage: Does something that should exist, not exist? (expansion direction)
- Example: Security/authentication exists but authorization system is undefined → coverage. Authentication and authorization are redundantly defined in the same module → conciseness.

### logic Boundary (predecessor/successor relationship)

- logic precedes: determines logical equivalence (entailment). Cross-reference: logic_rules.md 'Type System Logic' for type-level entailment rules, 'State Management Logic' for state-transition equivalence.
- conciseness follows: determines whether to remove after equivalence is confirmed
- Example: Superordinate interface's constraint entails subordinate implementation's constraint → logic determines equivalence → conciseness rules "subordinate redeclaration unnecessary."

### semantics Boundary (predecessor/successor relationship)

- semantics precedes: determines semantic identity (synonym status). Cross-reference: concepts.md §Homonyms Requiring Attention for canonical term resolution.
- conciseness follows: determines merge necessity after synonym is confirmed
- Example: user/account/member are the same concept → semantics determines synonymy → conciseness rules "consolidate to one canonical term."

### structure Boundary

- structure: Does the element conform to structural rules? (structure_spec.md 'Required Module Structure Elements', 'Architectural Patterns')
- conciseness: Is the element duplicated or unnecessary given the structure?
- Example: A module exists but violates the declared architectural pattern → structure. A module duplicates another module's functionality → conciseness.

---

## 5. Quantitative Criteria

Domain-observed thresholds for conciseness judgment. Each threshold is a signal for review, not an automatic removal trigger.

- **Code duplication**: >3 copies of the same logic (each >10 lines) → extraction candidate. Two copies may have different change-reasons (DRY targets knowledge duplication, not code duplication — see concepts.md 'DRY'); three copies almost certainly share one.
- **Feature flag lifetime**: >30 days after 100% rollout → removal candidate. The 30-day window allows rollback observation; after that, conditional branches are dead code (see Section 2).
- **Single-implementation interface lifetime**: >6 months with one implementation → review for removal. Sufficient time for a second implementation to arise if justified (see Section 2).
- **Module size after split**: <100 LOC each → premature split signal. Re-merge unless modules have genuinely different dependencies or change-reasons.
- **Test duplication**: Unit and integration tests sharing >80% identical assertions → consolidation candidate. Refactor to differentiate: unit tests for edge cases in isolation, integration tests for cross-component behavior.
- **Unused imports/exports**: >0 → removal target. Increases build time and creates false dependency signals. Most linters flag these automatically.
- **API field usage**: <5% consumer usage → deprecation candidate. Deprecate with a sunset period, then remove.

---

## Related Documents

- `concepts.md` — Homonyms requiring attention, abstraction layer classification (semantic criteria for redundancy). Key: 'Abstraction Layer Reference', 'Architecture Core Terms' ([L2] SRP, OCP, LSP, ISP, DIP, DRY, KISS, YAGNI)
- `structure_spec.md` — Module structure, architectural patterns, required relationships (structural removal criteria). Key: 'Required Module Structure Elements', 'Architectural Patterns', 'Required Relationships'
- `competency_qs.md` — Competency questions by verification concern (minimum granularity criteria). Key: CQ-S, CQ-D, CQ-T
- `dependency_rules.md` — Acyclic dependencies, direction rules, stability metrics (reference copy allowance basis). Key: 'Acyclic Dependencies', 'Direction Rules', 'Stable Dependencies Principle'
- `logic_rules.md` — Type system logic, state management logic (logical equivalence criteria). Key: 'Type System Logic', 'State Management Logic', 'Variance Rules'
- `domain_scope.md` — Sub-areas and concern classification (cross-boundary duplication context)
- `extension_cases.md` — Reserved future extensions (exception for retaining empty classifications)
