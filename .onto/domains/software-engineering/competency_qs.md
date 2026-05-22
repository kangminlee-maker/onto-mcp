---
version: 3
last_updated: "2026-03-31"
source: bundled-domain-baseline
status: established
---

# Software Engineering Domain — Competency Questions

A list of core questions that this domain's system must be able to answer.
The pragmatics agent verifies the actual reasoning path for each question.

Classification axis: **verification concern** — classified by the concern that questions must address when reviewing a software system.

Question priority principles: **Structural soundness (module structure, dependency direction, data flow) is the highest priority.** These concerns govern the majority of software design quality. Type safety, security, and operational fitness are secondary concerns applied on top of the structural foundation.

Priority levels:
- **P1** — Must be answerable for any software review. Failure indicates a fundamental design defect.
- **P2** — Should be answerable for production systems. Failure indicates a quality gap.
- **P3** — Recommended for mature systems. Failure indicates a refinement opportunity.

Prefix allocation protocol: New CQ sections use 1–2 character alphabetic prefix codes with mandatory `-` separator (e.g., CQ-XX-01). Prefixes must not be string prefixes of existing prefixes. Current allocations: S, D, I, E, T, V, O, A, SE, P, C, DE, B, R, MT, M.

---

## 1. Structural Understanding (CQ-S)

Verifies that the system's module structure, boundaries, and public interfaces are identifiable and well-defined.

- **CQ-S-01** [P1] Can the system's major modules and their roles be enumerated?
  - Inference path: structure_spec.md 'Required Module Structure Elements' → Entry Point, Business Logic, Data Access, Configuration/Environment are required → all modules must be listable
  - Verification criteria: PASS if a complete list of modules can be produced, each with a declared role. FAIL if modules exist that cannot be classified into a structural role

- **CQ-S-02** [P1] Can the modules that a specific module depends on be derived?
  - Inference path: dependency_rules.md 'Acyclic Dependencies' → module dependency graph must be a DAG → dependencies must be traceable; structure_spec.md 'Layer Structure Principles' → upper layers depend on lower layers
  - Verification criteria: PASS if for any module, direct and transitive dependencies can be enumerated from import statements or build configuration. FAIL if dependencies are implicit (global state, service locator without registration)

- **CQ-S-03** [P1] Can the list of public APIs (externally exposed interfaces) be extracted?
  - Inference path: structure_spec.md 'Golden Relationships' → Module-Interface coherence → every module must expose its contract via a public interface; structure_spec.md 'Required Relationships' → every public function/class must have at least one caller or test
  - Verification criteria: PASS if all publicly exported functions, classes, types, and endpoints can be enumerated. FAIL if the distinction between public and internal is unclear (everything exported, no access modifiers)

- **CQ-S-04** [P2] Does each module expose its contract without leaking internal implementation details?
  - Inference path: structure_spec.md 'Golden Relationships' → Module-Interface coherence → internal details must not leak; concepts.md 'Architecture Core Terms' → Module = independently replaceable unit with defined public interface
  - Verification criteria: PASS if consumers only import from the module's public API surface. FAIL if consumers directly import internal files or private functions

- **CQ-S-05** [P2] Is the architectural pattern explicitly declared and consistently applied?
  - Inference path: structure_spec.md 'Architectural Patterns' → each pattern defines specific dependency rules; domain_scope.md 'Structure & Architecture' → Module Separation is required
  - Verification criteria: PASS if the codebase declares its architectural pattern and conforms to that pattern's rules. FAIL if no pattern is declared or the codebase violates its declared pattern

- **CQ-S-06** [P2] Is the package/module organization axis consistently applied at each directory level?
  - Inference path: structure_spec.md 'Classification Criteria Design' → Package/Module Organization Axes; structure_spec.md 'Classification Criteria Design' → Anti-patterns → mixed axes at same level
  - Verification criteria: PASS if each directory level uses a single organization axis. FAIL if the same level mixes by-layer, by-feature, and by-type (e.g., `src/controllers/`, `src/user/`, `src/utils/`)

- **CQ-S-07** [P2] Are quantitative structural thresholds monitored?
  - Inference path: structure_spec.md 'Quantitative Thresholds' → module size >500 lines, function size >50 lines, cyclomatic complexity >10, dependency fan-out >7, inheritance depth >5
  - Verification criteria: PASS if structural metrics are measured and threshold violations are addressed or justified. FAIL if no metrics are measured or violations exist without justification

- **CQ-S-08** [P2] Are there isolated nodes (dead code, modules with no imports, public APIs without tests)?
  - Inference path: structure_spec.md 'Isolated Node Prohibition' → public function with no callers = dead code warning; public API without tests = verification gap
  - Verification criteria: PASS if no public functions or modules exist without at least one caller or test. FAIL if dead code or untested public APIs exist without intentional retention documentation

- **CQ-S-09** [P3] Is an intermediate abstraction layer justified by having 2+ consumers?
  - Inference path: structure_spec.md 'Authority and Layer Separation' → abstraction layer justified only when 2+ consumers directly consume it
  - Verification criteria: PASS if every abstraction layer has 2+ consumers. FAIL if single-consumer abstraction layers exist without justification

- **CQ-S-10** [P3] Is the distinction between definition authority and specification authority maintained?
  - Inference path: structure_spec.md 'Authority and Layer Separation' → direction of change is definition → specification → code
  - Verification criteria: PASS if changes flow from definition to specification to code with traceability. FAIL if specifications exist without traceability to defining documents

---

## 2. Data Flow (CQ-D)

Verifies that data paths are traceable, transformations identifiable, and sources of truth designated.

- **CQ-D-01** [P1] Can the path that a specific user input takes through the system be traced?
  - Inference path: domain_scope.md 'Structure & Architecture' → Data Flow → input-to-processing-to-output paths; structure_spec.md 'Required Module Structure Elements' → Entry Point → Business Logic → Data Access
  - Verification criteria: PASS if for any user input, the complete processing chain (entry → validation → logic → data access → response) can be traced. FAIL if any input path has untraceable segments

- **CQ-D-02** [P1] Can it be identified where specific data is created, transformed, and consumed?
  - Inference path: domain_scope.md 'Structure & Architecture' → Data Flow → transformation chains; concepts.md 'Data/State Management Terms' → State, Mutation, Transaction
  - Verification criteria: PASS if every data entity has identifiable creation, transformation, and consumption points. FAIL if data appears in a consumer without a traceable origin

- **CQ-D-03** [P1] Can the scope of impact when a state change occurs be determined?
  - Inference path: concepts.md 'Data/State Management Terms' → Mutation; logic_rules.md 'State Management Logic' → mixing side-effect and pure operations causes order-dependent results
  - Verification criteria: PASS if for any state mutation, all dependent components can be enumerated. FAIL if state changes propagate through untraceable channels (undocumented global state, implicit listeners)

- **CQ-D-04** [P1] Is a source of truth designated with priority rules for data inconsistency?
  - Inference path: dependency_rules.md 'Source of Truth Management' → when 3+ input paths exist, source of truth for each is required; concepts.md 'Architecture Core Terms' → Source of Truth definition
  - Verification criteria: PASS if every data entity has a declared source of truth with priority rules for inconsistencies. FAIL if the same data exists in multiple locations without declared authority

- **CQ-D-05** [P2] When CQRS is applied, is the eventual consistency lag bounded?
  - Inference path: logic_rules.md 'CQRS Rules' → maximum acceptable lag must be defined as a system contract; write model is source of truth
  - Verification criteria: PASS if maximum propagation delay from write to read model is documented. FAIL if CQRS is applied with no consistency guarantee

- **CQ-D-06** [P2] When Event Sourcing is used, are terminal states, projections, and partial commit prevention defined?
  - Inference path: domain_scope.md 'Data & State' → Event Sourcing; logic_rules.md 'State Management Logic' → single business operation with multiple events must choose partial commit prevention strategy
  - Verification criteria: PASS if event-sourced aggregates define terminal states, projector branches, and partial commit prevention strategy. FAIL if any of the three is missing

- **CQ-D-07** [P2] Is the schema strategy (schema-on-write vs schema-on-read) explicitly declared?
  - Inference path: domain_scope.md 'Data & State' → Data Modeling → schema strategy determines migration and consistency guarantees
  - Verification criteria: PASS if schema strategy is declared with implications for migration and consistency. FAIL if implicit or mixed without documentation

- **CQ-D-08** [P3] When data is delivered through multiple paths, is the priority for inconsistency resolution specified?
  - Inference path: dependency_rules.md 'Source of Truth Management' → multi-path data delivery priority must be specified as a contract
  - Verification criteria: PASS if multi-path data delivery includes a documented priority contract. FAIL if resolution is ad-hoc

---

## 3. Change Impact (CQ-I)

Verifies that the system supports safe evolution — changes can be assessed for impact, and backward compatibility is managed.

- **CQ-I-01** [P1] When a module/function's signature changes, can the affected consumers be enumerated?
  - Inference path: logic_rules.md 'Inter-module Contract Logic' → public API changes affect all consumers; dependency_rules.md 'Referential Integrity' → all types in public API must be exported
  - Verification criteria: PASS if for any public API change, all consumers can be enumerated via static analysis. FAIL if consumers exist that cannot be found statically (dynamic dispatch without registration, string-based imports)

- **CQ-I-02** [P1] When an external dependency changes, can the internal impact scope be determined?
  - Inference path: dependency_rules.md 'Package/Module Dependency Patterns' → Anti-corruption Layer translates between external and internal models; structure_spec.md 'Required Relationships' → external dependencies abstracted via interfaces
  - Verification criteria: PASS if external dependencies are abstracted behind interfaces (impact limited to adapter layer). FAIL if external types are used directly in business logic

- **CQ-I-03** [P1] When adding a new feature, can conflicts with existing logic be pre-verified?
  - Inference path: logic_rules.md 'Constraint Conflict Detection' → same-target opposing constraints = conflict; structure_spec.md 'Verification Structure' → CI/CD stages verify before merge
  - Verification criteria: PASS if CI includes static analysis, type checking, and tests that detect conflicts before merge. FAIL if new features can be merged without automated verification

- **CQ-I-04** [P2] Are breaking changes classified and documented with a versioning scheme?
  - Inference path: dependency_rules.md 'API Dependency Management' → Breaking vs Non-breaking Changes Classification; concepts.md 'Change Management Terms' → SemVer
  - Verification criteria: PASS if API changes are classified as breaking/non-breaking with version bumps and migration paths. FAIL if breaking changes are introduced without version changes

- **CQ-I-05** [P2] Is there a deprecation protocol for retiring APIs?
  - Inference path: concepts.md 'Change Management Terms' → Deprecation must specify what, when, and replacement
  - Verification criteria: PASS if deprecated APIs are marked, include replacement recommendations, and follow a timeline. FAIL if APIs are removed without deprecation

- **CQ-I-06** [P2] When schema changes are required, is the migration strategy defined?
  - Inference path: concepts.md 'Data/State Management Terms' → Migration must be reversible and idempotent; structure_spec.md 'Storage/Data Layer' → schema changes managed through migrations
  - Verification criteria: PASS if schema changes use versioned migrations with up/down scripts. FAIL if changes are applied ad-hoc without migration files

- **CQ-I-07** [P2] Can the dependency graph be verified as acyclic before introducing new dependencies?
  - Inference path: dependency_rules.md 'Acyclic Dependencies' → DAG required; dependency_rules.md 'Breaking Cycles' → resolution strategies
  - Verification criteria: PASS if dependency analysis tools run in CI and reject circular dependencies. FAIL if no automated cycle detection exists

- **CQ-I-08** [P3] When feature toggles are introduced, is the toggle lifecycle managed?
  - Inference path: concepts.md 'Change Management Terms' → Feature Toggle → toggle debt risk; domain_scope.md 'Operations & Deployment' → feature flags
  - Verification criteria: PASS if toggles have owners, expiration dates, and cleanup procedures. FAIL if toggles persist indefinitely (toggle debt)

---

## 4. Error Handling (CQ-E)

Verifies that error paths are defined, recovery strategies exist, and errors propagate with sufficient diagnostic information.

- **CQ-E-01** [P1] Are errors classified into operational (recoverable) and programmer (non-recoverable)?
  - Inference path: domain_scope.md 'Interface & Contract' → Error Handling → classification required; concepts.md 'Architecture Core Terms' → Middleware for error handling
  - Verification criteria: PASS if errors are classified: recoverable (network timeout, validation failure) vs non-recoverable (null dereference, assertion violation). FAIL if all errors are treated uniformly

- **CQ-E-02** [P1] Can the system's recovery path in a specific failure scenario be traced?
  - Inference path: domain_scope.md 'Required Concept Categories' → Error path → defenseless during failures if missing; logic_rules.md 'State Management Logic' → Saga compensation actions
  - Verification criteria: PASS if for any failure scenario, the recovery path (retry, fallback, circuit break, compensation) is traceable. FAIL if scenarios exist with no recovery path

- **CQ-E-03** [P1] Can the error propagation path from origin to handler be identified?
  - Inference path: logic_rules.md 'Type System Logic' → excluding state fields from failure branches blocks partial state propagation; concepts.md 'Type System Terms' → Discriminated Union for error branching
  - Verification criteria: PASS if error propagation follows a defined pattern (Result types, exception hierarchy, error middleware) and is traceable. FAIL if errors are swallowed, re-thrown without context, or propagate through undefined channels

- **CQ-E-04** [P1] Do user-facing error messages include cause and recommended actions?
  - Inference path: domain_scope.md 'Required Concept Categories' → Error path → user sees raw stack trace; domain_scope.md 'Interface & Contract' → Error Handling → user guidance
  - Verification criteria: PASS if error messages include (1) what went wrong, (2) what the user can do, and (3) a correlation ID. FAIL if users see raw exceptions or generic messages

- **CQ-E-05** [P2] Are circuit breaker patterns applied to external dependency calls?
  - Inference path: dependency_rules.md 'Runtime Dependency Rules' → Circuit Breaker; domain_scope.md 'Interface & Contract' → Error Handling → cascading failure prevention
  - Verification criteria: PASS if external calls implement circuit breaker with defined thresholds. FAIL if no failure isolation exists

- **CQ-E-06** [P2] Are retry policies defined with limits and backoff strategies?
  - Inference path: dependency_rules.md 'Runtime Dependency Rules' → Timeout and Retry Policies → exponential backoff with jitter; concepts.md 'Quality Terms' → Idempotent
  - Verification criteria: PASS if retries use exponential backoff, respect max counts, and only retry idempotent operations. FAIL if retries are unbounded or retry non-idempotent operations

- **CQ-E-07** [P2] Are bulkhead patterns applied to isolate resources between dependencies?
  - Inference path: dependency_rules.md 'Runtime Dependency Rules' → Bulkhead → isolate thread/connection pools per dependency
  - Verification criteria: PASS if resource pools are isolated per dependency. FAIL if all dependencies share a single pool

- **CQ-E-08** [P3] Are fallback paths defined for degraded operation?
  - Inference path: dependency_rules.md 'External Dependency Management' → external calls must have fallback; domain_scope.md 'Interface & Contract' → Error Handling → fallback paths
  - Verification criteria: PASS if critical flows define fallback behavior (cached data, defaults, queuing). FAIL if unavailability produces only errors

---

## 5. Types and Constraints (CQ-T)

Verifies that the type system and constraint design enforce correctness at the earliest possible stage.

- **CQ-T-01** [P1] Is exhaustive check applied in every switch on a discriminated union?
  - Inference path: logic_rules.md 'Type System Logic' → `default: never` is the only safety mechanism; concepts.md 'Type System Terms' → Exhaustive Check
  - Verification criteria: PASS if every switch/match on a discriminated union uses exhaustive handling that produces a compile error on new variants. FAIL if catch-all `default` silently handles unknown variants

- **CQ-T-02** [P1] Are hard and soft constraints distinguished, with hard constraints enforced by code?
  - Inference path: logic_rules.md 'Constraint Design Logic' → hard/soft classification; concepts.md 'Constraint Design Terms' → Hard = code-enforced, Soft = protocol-enforced
  - Verification criteria: PASS if hard constraints (type system, validation, DB constraints) and soft constraints (monitoring, alerts) are documented. FAIL if hard constraints rely only on protocol

- **CQ-T-03** [P1] Do all terminal states have transition events, processing branches, and allowed subsequent actions?
  - Inference path: concepts.md 'Data/State Management Terms' → Terminal State; domain_scope.md 'Required Concept Categories' → Lifecycle
  - Verification criteria: PASS if every terminal state has a transition event, handler branch, and explicit subsequent action list. FAIL if terminal states lack processing branches

- **CQ-T-04** [P2] Are type-level safety mechanisms used to prevent invalid states at compile time?
  - Inference path: logic_rules.md 'Type System Logic' → excluding fields from failure branches at compile time; domain_scope.md 'Interface & Contract' → Type System → type-level safety
  - Verification criteria: PASS if types make invalid states unrepresentable (separate validated/unvalidated types, Result types, branded types). FAIL if validity is checked only at runtime when compile-time is possible

- **CQ-T-05** [P2] Are database constraints aligned with application-level validation?
  - Inference path: logic_rules.md 'Constraint Design Logic' → Database vs Application Constraint Boundary → critical constraints in both layers; structure_spec.md 'Storage/Data Layer'
  - Verification criteria: PASS if critical constraints are enforced at both DB and application levels consistently. FAIL if constraints exist in only one layer

- **CQ-T-06** [P2] Are variance rules (covariant, contravariant, invariant) correctly declared?
  - Inference path: logic_rules.md 'Type System Logic' → Variance Rules; concepts.md 'Type System Terms' → Variance
  - Verification criteria: PASS if generic types use correct variance annotations and mutable collections are invariant. FAIL if variance misuse allows unsafe casts

- **CQ-T-07** [P2] Is schema validation applied at system boundaries?
  - Inference path: logic_rules.md 'Constraint Design Logic' → schema validation at entry point; logic_rules.md 'Security Logic' → Input Validation Logic → validate first
  - Verification criteria: PASS if every system boundary validates incoming data against a schema before processing. FAIL if data enters without validation

- **CQ-T-08** [P3] Are branded types applied where accidental structural compatibility is dangerous?
  - Inference path: logic_rules.md 'Type System Logic' → Structural vs Nominal Typing → branded types mitigate accidental matches; concepts.md 'Type System Terms' → Branded Type
  - Verification criteria: PASS if domain identifiers use branded types or nominal wrappers. FAIL if semantically distinct types are interchangeable

- **CQ-T-09** [P3] Are generic type handling strategies (erasure, reification, conditional types) correctly applied?
  - Inference path: logic_rules.md §Type System Logic → Generic Type Handling → type erasure vs reification; concepts.md §Type System Terms
  - Verification criteria: PASS if generic type limitations are documented and workarounds applied where needed (e.g., no runtime instanceof on erased generics in Java). FAIL if code assumes runtime generic information that is erased

- **CQ-T-10** [P3] Are constraints from base types propagated to all implementations?
  - Inference path: logic_rules.md §Constraint Design Logic → Constraint Propagation and Relaxation; concepts.md §Constraint Design Terms → Precondition, Postcondition
  - Verification criteria: PASS if base class invariants are verified at each implementation level. FAIL if subclass implementations silently weaken or ignore inherited constraints

---

## 6. Testing/Verification (CQ-V)

Verifies that the test strategy covers necessary levels, boundaries are correctly drawn, and verification is automated.

- **CQ-V-01** [P1] Can test existence for a specific feature be confirmed?
  - Inference path: structure_spec.md 'Golden Relationships' → Test-Code coherence → every public function needs a test; structure_spec.md 'Isolated Node Prohibition' → untested API = verification gap
  - Verification criteria: PASS if every public function has at least one test exercising its primary behavior. FAIL if public functions have no corresponding test

- **CQ-V-02** [P1] Can uncovered code paths be identified?
  - Inference path: structure_spec.md 'Quantitative Thresholds' → coverage <80% insufficient, <60% critical; domain_scope.md 'Verification & Quality' → Test Strategy
  - Verification criteria: PASS if coverage is measured with uncovered paths documented. FAIL if no coverage measurement exists or coverage <60% without remediation plan

- **CQ-V-03** [P1] Are happy path and error path each verified separately?
  - Inference path: domain_scope.md 'Required Concept Categories' → Happy path and Error path are separate categories; logic_rules.md 'Testing Logic' → Test Boundary Rules
  - Verification criteria: PASS if both success and error paths have dedicated tests per feature. FAIL if only happy-path tests exist

- **CQ-V-04** [P1] Are test levels (unit, integration, E2E) correctly classified and each present?
  - Inference path: domain_scope.md 'Verification & Quality' → Testing Pyramid; logic_rules.md 'Testing Logic' → Test Boundary Rules → unit vs integration boundary
  - Verification criteria: PASS if tests are classified by level with each present. FAIL if all tests are at one level, or if integration tests are mislabeled as unit tests

- **CQ-V-05** [P2] Are tests independent of execution order?
  - Inference path: logic_rules.md 'Testing Logic' → Test Independence → no order dependency; Test Determinism → flaky tests worse than no tests
  - Verification criteria: PASS if tests run in any order and in parallel without failures. FAIL if test B fails only after test A (shared mutable state)

- **CQ-V-06** [P2] Are contract tests in place for inter-service API boundaries?
  - Inference path: concepts.md 'Testing' → Contract Test; dependency_rules.md 'API Dependency Management' → Breaking vs Non-breaking Changes
  - Verification criteria: PASS if inter-service boundaries have contract tests. FAIL if integration is verified only by E2E or manual testing

- **CQ-V-07** [P2] Is the CI pipeline structured with verification at each stage?
  - Inference path: structure_spec.md 'Verification Structure' → CI/CD Pipeline Structure; Verification Boundary Rules → pre-commit only fast checks
  - Verification criteria: PASS if CI has pre-commit (linting), build (unit tests, type checking), and integration stages. FAIL if no automated verification before merge

- **CQ-V-08** [P2] Is static analysis integrated into the verification pipeline?
  - Inference path: structure_spec.md 'Verification Structure' → Static Analysis Integration → linting, type checking, dependency analysis
  - Verification criteria: PASS if linting, type checking, and dependency analysis run automatically in CI. FAIL if static analysis is optional or violations ignored

- **CQ-V-09** [P3] Is mutation testing applied to critical business logic?
  - Inference path: domain_scope.md 'Verification & Quality' → mutation testing; concepts.md 'Testing' → Mutation Test; logic_rules.md 'Testing Logic' → Mutation Testing → apply selectively
  - Verification criteria: PASS if mutation testing covers critical paths with surviving mutants reviewed. WARNING if not applied to critical logic

- **CQ-V-10** [P3] Is property-based testing used for functions with broad input domains?
  - Inference path: domain_scope.md 'Verification & Quality' → property-based testing; concepts.md 'Testing' → Property-Based Test
  - Verification criteria: PASS if broad-domain functions (parsers, validators, serializers) use property-based testing. WARNING if tested only with hand-picked examples

---

## 7. Deployment/Operations (CQ-O)

Verifies that the system is deployable, observable, and operable in production.

- **CQ-O-01** [P1] Can the running code version be determined per environment?
  - Inference path: domain_scope.md 'Operations & Deployment' → environment separation, monitoring; concepts.md 'DevOps' → Artifact = versioned immutable build output
  - Verification criteria: PASS if each environment has a mechanism to identify the exact code version (build hash, image tag, version endpoint). FAIL if no version identification exists

- **CQ-O-02** [P1] Are configurations separated from code and managed per environment?
  - Inference path: structure_spec.md 'Required Module Structure Elements' → Configuration/Environment is required; structure_spec.md 'Golden Relationships' → Config-Code separation
  - Verification criteria: PASS if environment-specific values are injected, not hardcoded. FAIL if business logic contains literal URLs, ports, or API keys

- **CQ-O-03** [P2] Is observability (logging, metrics, tracing) implemented?
  - Inference path: domain_scope.md 'Required Concept Categories' → Observability → undiagnosable issues if missing; concepts.md 'Observability' → Logging, Metrics, Tracing
  - Verification criteria: PASS if structured logging, metrics, and distributed tracing are present. FAIL if production issues cannot be diagnosed from telemetry

- **CQ-O-04** [P2] Are deployment strategies defined with rollback procedures?
  - Inference path: concepts.md 'DevOps' → Blue-Green, Canary, Rolling; domain_scope.md 'Operations & Deployment' → progressive rollouts
  - Verification criteria: PASS if deployment strategy includes rollback procedures and health check criteria. FAIL if deployments are all-or-nothing

- **CQ-O-05** [P2] Are SLIs/SLOs defined for critical paths?
  - Inference path: concepts.md 'Observability' → SLI/SLO/SLA; domain_scope.md 'Operations & Deployment' → error budgets
  - Verification criteria: PASS if critical paths have defined SLIs with target SLOs. FAIL if no quantitative service level targets exist

- **CQ-O-06** [P3] Are the 12-Factor App principles addressed?
  - Inference path: domain_scope.md 'Operations & Deployment' → 12-Factor App; domain_scope.md 'Normative System Classification' → Layer 3 standards
  - Verification criteria: PASS if each factor is addressed (compliance or documented deviation). FAIL if not assessed for cloud-deployed services

---

## 8. AI Agent Collaboration (CQ-A)

Verifies that specifications support AI agent execution — self-contained, unambiguous, and verifiable. Applicable when AI agents are consumers or executors.

- **CQ-A-01** [P1] Is the specification that an AI agent executes self-contained?
  - Inference path: concepts.md 'Document Design Terms' → Self-contained Spec required when AI agents are executors; domain_scope.md 'Documentation & Consumers' → dual-consumer handling
  - Verification criteria: PASS if every AI-executed spec includes all necessary context without depending on other sessions or implicit knowledge. FAIL if the spec requires absent context

- **CQ-A-02** [P1] Are verification criteria for AI-generated output defined at the "ambiguity detection" level?
  - Inference path: logic_rules.md 'Constraint Design Logic' → free-text pass_criteria fail modes: partial fulfillment, arbitrary interpretation; structure_spec.md 'Verification Structure' → "what to verify" and "how verified" must be separate
  - Verification criteria: PASS if verification uses concrete, measurable criteria (not subjective assessment). FAIL if criteria allow partial fulfillment or arbitrary interpretation

- **CQ-A-03** [P2] Are reading paths specified for AI vs human documentation consumers?
  - Inference path: domain_scope.md 'Documentation & Consumers' → dual-consumer handling; concepts.md 'Document Design Terms' → Contract Document vs Guide Document
  - Verification criteria: PASS if contract (machine-readable) and guide (human-readable) content are structurally separated. FAIL if specs and explanations are mixed without separation

- **CQ-A-04** [P2] Is constraint design for AI tasks using pre-inclusion rather than post-verification?
  - Inference path: logic_rules.md 'Constraint Design Logic' → pre-inclusion > post-verification for quality assurance
  - Verification criteria: PASS if constraints are embedded in generation directives. FAIL if constraints exist only as post-generation checklists

- **CQ-A-05** [P3] Are inter-agent contracts specified as typed interfaces?
  - Inference path: structure_spec.md 'Golden Relationships' → Module-Interface coherence; logic_rules.md 'Inter-module Contract Logic' → API changes affect consumers
  - Verification criteria: PASS if inter-agent communication uses typed schemas. FAIL if agents communicate via unstructured natural language

- **CQ-A-06** [P3] Is AI agent autonomy explicitly bounded?
  - Inference path: domain_scope.md 'Documentation & Consumers' → Constraint Design → hard/soft classification; concepts.md 'Constraint Design Terms' → Hard vs Soft Constraint
  - Verification criteria: PASS if agent permissions define autonomous scope, human-approval scope, and prohibited actions. FAIL if scope is undefined

---

## 9. Security (CQ-SE)

Verifies that authentication, authorization, input validation, and supply chain security are addressed.

- **CQ-SE-01** [P1] Are authentication mechanisms correctly implemented?
  - Inference path: logic_rules.md 'Security Logic' → Authentication Logic → token validation: structure, signature, expiration, issuer, audience → skipping any = vulnerability; domain_scope.md 'Security & Auth' → OAuth 2.0/OIDC
  - Verification criteria: PASS if token validation checks all five steps and sessions have absolute/idle timeouts with invalidation on password change. FAIL if any step is skipped or sessions lack expiration

- **CQ-SE-02** [P1] Is authorization enforced at the correct granularity (not just authentication)?
  - Inference path: domain_scope.md 'Security & Auth' → RBAC vs ABAC; domain_scope.md 'Bias Detection Criteria' → security scope bias: auth without authz = full access (OWASP A01)
  - Verification criteria: PASS if every protected resource checks user permission level. FAIL if only "is logged in" is checked without "has permission"

- **CQ-SE-03** [P1] Is input validation applied at system boundaries with defense in depth?
  - Inference path: logic_rules.md 'Security Logic' → Input Validation Logic → defense in depth; Injection prevention → parameterized queries, output encoding
  - Verification criteria: PASS if validation occurs at boundaries AND inner layers (parameterized queries, output encoding, CSP) are in place. FAIL if single-layer validation or string concatenation for SQL

- **CQ-SE-04** [P2] Is the authorization model documented with policy conflict resolution?
  - Inference path: logic_rules.md 'Security Logic' → Authorization Logic → deny-overrides, permit-overrides, first-applicable; concepts.md 'Security' → RBAC vs ABAC
  - Verification criteria: PASS if authorization model is documented with explicit conflict resolution strategy. FAIL if multiple policies apply with no resolution order

- **CQ-SE-05** [P2] Are dependency security audits automated in CI?
  - Inference path: dependency_rules.md 'Build/Package Dependency Rules' → Dependency Security → audit in CI; domain_scope.md 'Security & Auth' → supply chain security
  - Verification criteria: PASS if `npm audit` / `pip audit` or equivalent runs in CI with critical vulnerabilities blocking merge. FAIL if no automated scanning

- **CQ-SE-06** [P2] Are OWASP Top 10 risks systematically addressed?
  - Inference path: domain_scope.md 'Security & Auth' → OWASP Top 10 (2021); domain_scope.md 'Reference Standards/Frameworks' → OWASP for web-facing systems
  - Verification criteria: PASS if assessed against OWASP Top 10 with mitigations documented. FAIL if no assessment for web-facing systems

---

## 10. Performance (CQ-P)

Verifies that performance requirements are defined, measured, and validated. Scale-dependent — small systems may not need all of these.

- **CQ-P-01** [P2] Are performance targets defined as measurable SLOs?
  - Inference path: domain_scope.md 'Verification & Quality' → Performance → p50/p95/p99 latency, RPS, error rate; concepts.md 'Observability' → SLI/SLO
  - Verification criteria: PASS if critical paths have targets (e.g., p99 < 500ms). FAIL if no performance targets for production endpoints

- **CQ-P-02** [P2] Is caching applied with explicit invalidation and consistency guarantees?
  - Inference path: domain_scope.md 'Required Concept Categories' → Source of truth; concepts.md 'Data/State Management Terms' → Eventual Consistency
  - Verification criteria: PASS if cached data has TTL or invalidation trigger and documented source-of-truth relationship. FAIL if caching lacks invalidation strategy

- **CQ-P-03** [P2] Is load testing performed for expected and peak traffic?
  - Inference path: domain_scope.md 'Verification & Quality' → load testing; structure_spec.md 'Quantitative Thresholds' → P99 > 1s triggers review
  - Verification criteria: PASS if load tests simulate expected/peak traffic with results compared to SLOs. FAIL if no load testing for concurrent-user systems

- **CQ-P-04** [P3] Are common performance anti-patterns (N+1, unindexed, unbounded) identified?
  - Inference path: structure_spec.md 'Storage/Data Layer'; domain_scope.md 'Verification & Quality' → identify bottlenecks before production
  - Verification criteria: PASS if anti-patterns detected by tooling or review. FAIL if known anti-patterns exist in production without mitigation

- **CQ-P-05** [P2] Is caching invalidation strategy defined with consistency guarantees?
  - Inference path: logic_rules.md §Performance Logic → Caching Rules → cache invalidation strategies; dependency_rules.md §Source of Truth Management
  - Verification criteria: PASS if cached data has explicit invalidation strategy (TTL, event-based, versioned) with documented staleness tolerance. FAIL if caching has no invalidation strategy

- **CQ-P-06** [P2] Are N+1 query patterns detected and prevented?
  - Inference path: logic_rules.md §Performance Logic → N+1 Query Detection; structure_spec.md §Storage/Data Layer
  - Verification criteria: PASS if ORM queries are monitored for N+1 patterns with batch loading applied. FAIL if list endpoints issue N+1 queries to the database

- **CQ-P-07** [P3] Are database indexes aligned with query patterns in hot paths?
  - Inference path: logic_rules.md §Performance Logic → Index Strategy; structure_spec.md §Quantitative Thresholds
  - Verification criteria: PASS if hot-path queries have supporting indexes verified by query plan analysis. FAIL if production queries perform full table scans on large tables

---

## 11. Concurrency (CQ-C)

Verifies that concurrent access is handled safely — deadlocks prevented, race conditions addressed, concurrency model appropriate.

- **CQ-C-01** [P1] Are race conditions (check-then-act, read-modify-write, TOCTOU) addressed?
  - Inference path: logic_rules.md 'Concurrency Logic' → Race Condition Patterns → each requires atomic solutions; domain_scope.md 'Required Concept Categories' → Concurrency → data corruption under load
  - Verification criteria: PASS if concurrent data access uses atomic operations, synchronization, or immutable structures. FAIL if mutable shared state is accessed without synchronization

- **CQ-C-02** [P1] Is the concurrency model explicitly chosen and its constraints respected?
  - Inference path: logic_rules.md 'Concurrency Logic' → Concurrency Model Rules → Go/Node.js/Actor each have constraints; concepts.md 'Language/Runtime Fundamentals' → Thread, Event Loop, Coroutine
  - Verification criteria: PASS if concurrency model is documented and constraints respected (e.g., no blocking in event loop). FAIL if model is implicit or constraints violated

- **CQ-C-03** [P2] Are deadlock conditions prevented?
  - Inference path: logic_rules.md 'Concurrency Logic' → Deadlock Conditions → Coffman's four conditions; lock ordering prevents circular wait
  - Verification criteria: PASS if multi-lock code uses consistent global ordering or timeout-based acquisition. FAIL if locks acquired in inconsistent orders

- **CQ-C-04** [P2] Is optimistic vs pessimistic concurrency control chosen appropriately?
  - Inference path: logic_rules.md 'State Management Logic' → Distributed State Rules → optimistic for low contention, pessimistic for high; concepts.md 'Data/State Management Terms' → Optimistic vs Pessimistic Locking
  - Verification criteria: PASS if strategy is documented with justification based on conflict probability. FAIL if implicit or mismatched to contention level

---

## 12. Dependencies (CQ-DE)

Verifies that dependency management is sound — direction rules enforced, external dependencies managed, build reproducibility guaranteed.

- **CQ-DE-01** [P1] Is the dependency graph acyclic?
  - Inference path: dependency_rules.md 'Acyclic Dependencies' → ADP → DAG required; dependency_rules.md 'Breaking Cycles' → inversion, events, shared kernel strategies
  - Verification criteria: PASS if dependency graph is verified acyclic by tooling. FAIL if circular dependencies exist. Type-only circular imports are WARNING

- **CQ-DE-02** [P1] Do dependencies point in the correct direction (stable inward, volatile outward)?
  - Inference path: dependency_rules.md 'Direction Rules' → DIP; dependency_rules.md 'Stable Dependencies Principle'; dependency_rules.md 'Clean Architecture Dependency Rule'
  - Verification criteria: PASS if business logic depends on abstractions, not infrastructure. FAIL if business logic imports framework classes without abstraction

- **CQ-DE-03** [P1] Are lock files committed and deterministic builds guaranteed?
  - Inference path: dependency_rules.md 'Build/Package Dependency Rules' → Lock File Management → lock files ensure deterministic builds
  - Verification criteria: PASS if lock files are committed and CI uses frozen installs (`npm ci`). FAIL if lock files are gitignored or CI uses non-deterministic installs

- **CQ-DE-04** [P2] Are external dependencies abstracted behind interfaces?
  - Inference path: dependency_rules.md 'Package/Module Dependency Patterns' → Anti-corruption Layer; structure_spec.md 'Required Relationships' → external dependencies abstracted via interfaces
  - Verification criteria: PASS if external dependencies accessed through adapter/repository interfaces. FAIL if business logic directly uses external dependency types

- **CQ-DE-05** [P2] Are diamond dependencies resolved with consistent version selection?
  - Inference path: dependency_rules.md 'Diamond Dependencies' → different versions of same module prohibited; dependency_rules.md 'Build/Package Dependency Rules' → Dependency Resolution Algorithms
  - Verification criteria: PASS if diamond dependencies resolve to a single version per package. FAIL if version conflicts exist in the resolved tree

- **CQ-DE-06** [P3] Are phantom dependencies (undeclared but hoisted) prevented?
  - Inference path: dependency_rules.md 'Build/Package Dependency Rules' → Transitive Dependency Management → phantom dependencies from hoisting; dependency_rules.md 'Referential Integrity' → imported modules must be declared
  - Verification criteria: PASS if only declared dependencies can be imported. FAIL if code imports undeclared packages relying on hoisting

## 13. Boundary Conditions (CQ-B)

Verifies that edge cases, limits, and boundary values are identified and handled.

Scope boundary: CQ-B addresses **value-level boundaries** (min/max, empty, overflow). Type-level safety mechanisms belong to CQ-T. Concurrency resource limits under load belong to CQ-C.

- **CQ-B-01** [P1] Are boundary values (min/max, empty, null) identified and tested for each input?
  - Inference path: domain_scope.md 'Required Concept Categories' → Boundary condition → edge case failures; logic_rules.md §Error Handling Logic → Error Classification → operational errors include validation failure
  - Verification criteria: PASS if each input has documented boundary values with tests for min, max, empty, and null cases. FAIL if boundary values are not identified or only happy-path values are tested

- **CQ-B-02** [P1] Are integer overflow/underflow risks identified in arithmetic operations?
  - Inference path: domain_scope.md 'Required Concept Categories' → Boundary condition → integer overflow in payment calculation; logic_rules.md §Type System Logic → type safety
  - Verification criteria: PASS if arithmetic operations on user-influenced values use overflow-safe types or explicit checks. FAIL if arithmetic can overflow silently (e.g., 32-bit integer for monetary values)

- **CQ-B-03** [P2] Are concurrent access boundaries addressed at resource limits?
  - Inference path: domain_scope.md 'Required Concept Categories' → Boundary condition → concurrent access; logic_rules.md §Concurrency Logic → Race Condition Patterns
  - Verification criteria: PASS if resource limits (connection pools, thread pools, queue depths) have defined behavior at capacity. FAIL if resource exhaustion leads to undefined behavior

- **CQ-B-04** [P2] Are collection size boundaries handled (empty collections, single-element, maximum size)?
  - Inference path: domain_scope.md 'Required Concept Categories' → Boundary condition → empty array dereference; logic_rules.md §Constraint Design Logic → schema validation at entry point
  - Verification criteria: PASS if operations on collections handle empty, single-element, and maximum-size cases. FAIL if code assumes non-empty collections without validation

---

## 14. Requirements & Specification (CQ-R)

Verifies that requirements are captured, testable, and traceable. Applicable when formal requirements management is practiced.

Scope boundary: CQ-R addresses **requirements traceability and quantification**. Test strategy and coverage belong to CQ-V.

- **CQ-R-01** [P2] Is each functional requirement traceable to at least one test or verification method?
  - Inference path: domain_scope.md §Interface & Contract → Requirements & Specification → testable requirements; structure_spec.md §Golden Relationships → Test-Code coherence
  - Verification criteria: PASS if a traceability matrix (or equivalent) links requirements to tests. FAIL if requirements exist without corresponding verification

- **CQ-R-02** [P2] Are non-functional requirements quantified with measurable targets?
  - Inference path: domain_scope.md §Interface & Contract → Requirements & Specification → non-functional requirements must be quantified; domain_scope.md §Verification & Quality → Performance → p50/p95/p99
  - Verification criteria: PASS if NFRs have numeric targets (e.g., p99 < 500ms, 99.9% availability). FAIL if NFRs are stated qualitatively ("should be fast")

---

## 15. Maintenance (CQ-MT)

Verifies that maintenance processes are defined and classified. Applicable when the system has an established user base with ongoing development.

- **CQ-MT-01** [P2] Are maintenance activities classified by type (corrective/adaptive/perfective/preventive)?
  - Inference path: domain_scope.md §Operations, Deployment & Maintenance → Maintenance → IEEE 14764 four categories; concepts.md §Change Management Terms → Technical Debt
  - Verification criteria: PASS if maintenance work is classified and tracked by type with distinct workflows. FAIL if all maintenance is treated as undifferentiated "bug fixes"

- **CQ-MT-02** [P2] Is technical debt tracked with remediation plans?
  - Inference path: domain_scope.md §Operations, Deployment & Maintenance → Maintenance → preventive maintenance; concepts.md §Interpretation Principles → "Technical debt" is not "code I don't like"
  - Verification criteria: PASS if technical debt items are documented with estimated cost and remediation priority. FAIL if technical debt is acknowledged informally but not tracked

---

## 16. Event/Messaging (CQ-M)

Verifies that asynchronous messaging patterns are correctly implemented. Applicable when the system uses message queues, event buses, or pub/sub patterns.

Scope boundary: CQ-M addresses **messaging infrastructure and delivery semantics**. Data flow traceability belongs to CQ-D.

- **CQ-M-01** [P1] Is the message delivery guarantee explicitly chosen and its trade-offs documented?
  - Inference path: domain_scope.md §Structure & Architecture → Event/Messaging → at-most-once, at-least-once, exactly-once trade-offs; logic_rules.md §State Management Logic → determinism
  - Verification criteria: PASS if delivery guarantee is documented with justification. FAIL if the guarantee is implicit or unknown

- **CQ-M-02** [P1] Are message consumers idempotent when at-least-once delivery is used?
  - Inference path: concepts.md §Quality Terms → Idempotent; logic_rules.md §State Management Logic → determinism
  - Verification criteria: PASS if consumers handle duplicate messages safely (idempotency keys, deduplication). FAIL if duplicate processing causes side effects

- **CQ-M-03** [P2] Is message ordering guaranteed where business logic requires it?
  - Inference path: domain_scope.md §Structure & Architecture → Event/Messaging → pipeline scalability; logic_rules.md §State Management Logic → Fundamental State Rules → same input must produce same output
  - Verification criteria: PASS if ordering-sensitive operations use partitioned/ordered channels. FAIL if ordering is assumed but not enforced

- **CQ-M-04** [P2] Are dead-letter queues configured for unprocessable messages?
  - Inference path: logic_rules.md §Error Handling Logic → Error Classification → operational errors; domain_scope.md §Required Concept Categories → Error path
  - Verification criteria: PASS if failed messages are routed to DLQ with monitoring. FAIL if unprocessable messages are silently dropped or block the queue

---

## Related Documents
- domain_scope.md — top-level scope definition and bias detection criteria
- concepts.md — term definitions for type system, architecture, testing, security, etc.
- logic_rules.md — rules for types (CQ-T), state (CQ-D), security (CQ-SE), concurrency (CQ-C), testing (CQ-V), AI agent collaboration (CQ-A)
- structure_spec.md — rules for module structure (CQ-S), golden relationships (CQ-V), verification pipeline (CQ-V), thresholds (CQ-S)
- logic_rules.md §Error Handling Logic — inference path target for CQ-B boundary condition questions
- domain_scope.md §Operations, Deployment & Maintenance — inference path target for CQ-MT maintenance questions
- dependency_rules.md — rules for dependency direction (CQ-DE), API management (CQ-I), build dependencies (CQ-DE), runtime dependencies (CQ-E)
- domain_scope.md §Sub-area to CQ Section Mapping — mapping between scope sub-areas and CQ sections
