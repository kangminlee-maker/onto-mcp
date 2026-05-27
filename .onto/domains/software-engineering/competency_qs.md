---
version: 8
last_updated: "2026-05-28"
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

Prefix allocation protocol: New CQ sections use 1–2 character alphabetic prefix codes with mandatory `-` separator (e.g., CQ-XX-01). Prefixes must not be string prefixes of existing prefixes. Current allocations: S, D, I, E, T, V, O, A, SE, P, C, DE, B, R, MT, M, G.

Applicability verdict protocol: Every CQ has an applicability result before PASS/FAIL. Use `N/A` only when the target lacks the pattern, scale, risk, consumer, or behavior named by the CQ and that absence is supported by architecture, dependency, product, or scope evidence. A missing artifact is `FAIL`, not `N/A`, when the target actually uses the pattern or claims the obligation.

---

## 1. Structural Understanding (CQ-S)

Verifies that the system's module structure, boundaries, and public interfaces are identifiable and well-defined.

- **CQ-S-01** [P1] Can the system's major modules and their roles be enumerated?
  - Inference path: structure_spec.md 'Required Module Structure Elements' → Entry Point, Business Logic, Data Access, Configuration/Environment are required → all modules must be listable
  - Verification criteria: PASS if a complete list of modules can be produced, each with a declared role. FAIL if modules exist that cannot be classified into a structural role

- **CQ-S-02** [P1] Can the modules that a specific module depends on be derived?
  - Inference path: dependency_rules.md 'Acyclic Dependencies' → module dependency graph must be a DAG → dependencies must be traceable; dependency_rules.md 'Direction Rules' → dependency kind and declared architecture determine direction rules
  - Verification criteria: PASS if for any module, direct and transitive dependencies can be enumerated from import statements, build configuration, or declared registration artifacts. FAIL if dependencies are implicit (global state, service locator without registration) or cannot be classified by dependency kind

- **CQ-S-03** [P1] Can the list of public APIs (externally exposed interfaces) be extracted?
  - Inference path: structure_spec.md 'Golden Relationships' → Module-Interface coherence → every module must expose its contract via a public interface; structure_spec.md 'Required Relationships' → every public function/class must have at least one caller or test
  - Verification criteria: PASS if all publicly exported functions, classes, types, and endpoints can be enumerated. FAIL if the distinction between public and internal is unclear (everything exported, no access modifiers)

- **CQ-S-04** [P2] Does each module expose its contract without leaking internal implementation details?
  - Inference path: structure_spec.md 'Golden Relationships' → Module-Interface coherence → internal details must not leak; concepts.md 'Architecture Core Terms' → Module = independently replaceable unit with defined public interface
  - Verification criteria: PASS if consumers only import from the module's public API surface. FAIL if consumers directly import internal files or private functions

- **CQ-S-05** [P2] Is the architectural pattern explicitly declared and consistently applied?
  - Inference path: structure_spec.md 'Architectural Patterns' → each pattern defines specific dependency rules; domain_scope.md 'Major Sub-areas' → Architecture and structure
  - Verification criteria: PASS if the codebase declares its architectural pattern and conforms to that pattern's rules. FAIL if no pattern is declared or the codebase violates its declared pattern

- **CQ-S-06** [P2] Is the package/module organization axis consistently applied at each directory level?
  - Inference path: structure_spec.md 'Classification Criteria Design' → Package/Module Organization Axes; structure_spec.md 'Classification Criteria Design' → Anti-patterns → mixed axes at same level
  - Verification criteria: PASS if each directory level uses a single organization axis. FAIL if the same level mixes by-layer, by-feature, and by-type (e.g., `src/controllers/`, `src/user/`, `src/utils/`)

- **CQ-S-07** [P2] Are quantitative structural thresholds monitored?
  - Inference path: structure_spec.md 'Quantitative Thresholds' → module size >500 lines, function size >50 lines, cyclomatic complexity >10, dependency fan-out >7, inheritance depth >5
  - Verification criteria: PASS if structural metrics are measured and threshold violations are addressed or justified. FAIL if no metrics are measured or violations exist without justification

- **CQ-S-08** [P2] Are isolated nodes or intentionally retained unreachable modules identifiable?
  - Inference path: structure_spec.md 'Isolated Node Prohibition' → public function/class with no callers and modules with no imports are dead-code or retention signals; CQ-V-01 owns public API test existence
  - Verification criteria: PASS if public functions/classes have callers or intentional-retention rationale, and modules are imported, exposed, or intentionally retained. FAIL if unreachable public APIs or modules exist with no caller/import/export/retention rationale

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
  - Inference path: domain_scope.md 'Major Sub-areas' → Architecture and structure; structure_spec.md 'Required Module Structure Elements' → Entry Point → Business Logic → Data Access
  - Verification criteria: PASS if for any user input, the complete processing chain (entry → validation → logic → data access → response) can be traced. FAIL if any input path has untraceable segments

- **CQ-D-02** [P1] Can it be identified where specific data is created, transformed, and consumed?
  - Inference path: domain_scope.md 'Major Sub-areas' → Data and state + Architecture and structure; concepts.md 'Data/State Management Terms' → State, Mutation, Transaction
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
  - Inference path: domain_scope.md 'Major Sub-areas' → Data and state; logic_rules.md 'State Management Logic' → single business operation with multiple events must choose partial commit prevention strategy
  - Verification criteria: PASS if event-sourced aggregates define terminal states, projector branches, and partial commit prevention strategy. FAIL if any of the three is missing

- **CQ-D-07** [P2] Is the schema strategy (schema-on-write vs schema-on-read) explicitly declared?
  - Inference path: domain_scope.md 'Major Sub-areas' → Data and state; schema strategy determines migration and consistency guarantees
  - Verification criteria: PASS if schema strategy is declared with implications for migration and consistency. FAIL if implicit or mixed without documentation

- **CQ-D-08** [P3] When data is delivered through multiple paths, is the priority for inconsistency resolution specified?
  - Inference path: dependency_rules.md 'Source of Truth Management' → multi-path data delivery priority must be specified as a contract
  - Verification criteria: PASS if multi-path data delivery includes a documented priority contract. FAIL if resolution is ad-hoc

- **CQ-D-09** [P2] Are retention and deletion obligations traceable across primary and derived data stores?
  - Inference path: concepts.md 'Security Terms' → Data Classification, Retention Policy, Deletion/Erasure Path; domain_scope.md 'Major Sub-areas' → Data and state
  - Verification criteria: N/A if the system stores no user, tenant, regulated, or operationally retained data. PASS if classified data has retention/deletion rules covering primary stores, indexes, caches, logs, backups, generated artifacts, and downstream processors. FAIL if data can outlive its declared purpose or deletion is not traceable across derived stores

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
  - Inference path: concepts.md 'Change Management Terms' → Feature Toggle → toggle debt risk; domain_scope.md 'Major Sub-areas' → Operations and maintenance
  - Verification criteria: PASS if toggles have owners, expiration dates, and cleanup procedures. FAIL if toggles persist indefinitely (toggle debt)

---

## 4. Error Handling (CQ-E)

Verifies that error paths are defined, recovery strategies exist, and errors propagate with sufficient diagnostic information.

- **CQ-E-01** [P1] Are errors classified into operational (recoverable) and programmer (non-recoverable)?
  - Inference path: domain_scope.md 'Major Sub-areas' → Error and failure posture; concepts.md 'Architecture Core Terms' → Middleware for error handling
  - Verification criteria: PASS if errors are classified: recoverable (network timeout, validation failure) vs non-recoverable (null dereference, assertion violation). FAIL if all errors are treated uniformly

- **CQ-E-02** [P1] Can the system's recovery path in a specific failure scenario be traced?
  - Inference path: domain_scope.md 'Required Concept Categories' → Error path → defenseless during failures if missing; logic_rules.md 'State Management Logic' → Saga compensation actions
  - Verification criteria: PASS if for any failure scenario, the recovery path (retry, fallback, circuit break, compensation) is traceable. FAIL if scenarios exist with no recovery path

- **CQ-E-03** [P1] Can the error propagation path from origin to handler be identified?
  - Inference path: logic_rules.md 'Type System Logic' → excluding state fields from failure branches blocks partial state propagation; concepts.md 'Type System Terms' → Discriminated Union for error branching
  - Verification criteria: PASS if error propagation follows a defined pattern (Result types, exception hierarchy, error middleware) and is traceable. FAIL if errors are swallowed, re-thrown without context, or propagate through undefined channels

- **CQ-E-04** [P1] Do user-facing error messages include cause and recommended actions?
  - Inference path: domain_scope.md 'Required Concept Categories' → Error path; domain_scope.md 'Major Sub-areas' → Error and failure posture
  - Verification criteria: PASS if error messages include (1) what went wrong, (2) what the user can do, and (3) a correlation ID. FAIL if users see raw exceptions or generic messages

- **CQ-E-05** [P2] Are circuit breaker patterns applied to external dependency calls?
  - Inference path: dependency_rules.md 'Runtime Dependency Rules' → Circuit Breaker; domain_scope.md 'Major Sub-areas' → Error and failure posture
  - Verification criteria: PASS if external calls implement circuit breaker with defined thresholds. FAIL if no failure isolation exists

- **CQ-E-06** [P2] Are retry policies defined with limits and backoff strategies?
  - Inference path: dependency_rules.md 'Runtime Dependency Rules' → Timeout and Retry Policies → exponential backoff with jitter; concepts.md 'Quality Terms' → Idempotent
  - Verification criteria: PASS if retries use exponential backoff, respect max counts, and only retry idempotent operations. FAIL if retries are unbounded or retry non-idempotent operations

- **CQ-E-07** [P2] Are bulkhead patterns applied to isolate resources between dependencies?
  - Inference path: dependency_rules.md 'Runtime Dependency Rules' → Bulkhead → isolate thread/connection pools per dependency
  - Verification criteria: PASS if resource pools are isolated per dependency. FAIL if all dependencies share a single pool

- **CQ-E-08** [P3] Are dependency failure semantics defined for degraded or halted operation?
  - Inference path: dependency_rules.md 'External Dependency Management' → external calls declare retry, timeout, circuit breaker, explicit degraded behavior, or fail-loud/fail-close behavior; domain_scope.md 'Major Sub-areas' → Error and failure posture
  - Verification criteria: PASS if critical flows define whether they retry, degrade visibly, queue, fail-close, or fail-loud with diagnostics. FAIL if unavailability triggers hidden fallback or has no declared behavior

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
  - Inference path: logic_rules.md 'Type System Logic' → excluding fields from failure branches at compile time; domain_scope.md 'Major Sub-areas' → Interface and contract
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
  - Inference path: structure_spec.md 'Quantitative Thresholds' → coverage <80% insufficient, <60% critical; domain_scope.md 'Major Sub-areas' → Verification and quality
  - Verification criteria: PASS if coverage is measured with uncovered paths documented. FAIL if no coverage measurement exists or coverage <60% without remediation plan

- **CQ-V-03** [P1] Are happy path and error path each verified separately?
  - Inference path: domain_scope.md 'Required Concept Categories' → Happy path and Error path are separate categories; logic_rules.md 'Testing Logic' → Test Boundary Rules
  - Verification criteria: PASS if both success and error paths have dedicated tests per feature. FAIL if only happy-path tests exist

- **CQ-V-04** [P1] Are applicable test levels correctly classified and justified?
  - Inference path: domain_scope.md 'Major Sub-areas' → Verification and quality; logic_rules.md 'Testing Logic' → Test Boundary Rules → unit vs integration boundary
  - Verification criteria: PASS if unit, integration, E2E, contract, semantic, or other relevant verification levels are classified according to target risk and each applicable level is present or explicitly N/A with rationale. FAIL if required levels are missing, all tests are collapsed into one level, or integration/E2E/semantic checks are mislabeled as unit tests

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
  - Inference path: domain_scope.md 'Major Sub-areas' → Verification and quality; concepts.md 'Testing' → Mutation Test; logic_rules.md 'Testing Logic' → Mutation Testing → apply selectively
  - Verification criteria: PASS if mutation testing covers critical paths with surviving mutants reviewed. WARNING if not applied to critical logic

- **CQ-V-10** [P3] Is property-based testing used for functions with broad input domains?
  - Inference path: domain_scope.md 'Major Sub-areas' → Verification and quality; concepts.md 'Testing' → Property-Based Test
  - Verification criteria: PASS if broad-domain functions (parsers, validators, serializers) use property-based testing. WARNING if tested only with hand-picked examples

- **CQ-V-11** [P2] Are critical user-facing flows tested for accessibility and locale behavior when applicable?
  - Inference path: concepts.md 'Internationalization/Accessibility Terms' → WCAG, ARIA, Screen Reader, Locale, ICU; domain_scope.md 'Major Sub-areas' → Accessibility and internationalization
  - Verification criteria: N/A if the system has no user-facing UI/API text, locale-sensitive output, or accessibility obligation. PASS if critical flows have accessibility checks and locale/formatting tests appropriate to their exposure. FAIL if public or regulated user-facing flows lack accessibility/i18n verification

---

## 7. Deployment/Operations (CQ-O)

Verifies that the system is deployable, observable, and operable in production.

- **CQ-O-01** [P1] Can the running code version be determined per environment?
  - Inference path: domain_scope.md 'Major Sub-areas' → Operations and maintenance; concepts.md 'DevOps Terms' → Build Artifact
  - Verification criteria: PASS if each environment has a mechanism to identify the exact code version (build hash, image tag, version endpoint). FAIL if no version identification exists

- **CQ-O-02** [P1] Are configurations separated from code and managed per environment?
  - Inference path: structure_spec.md 'Required Module Structure Elements' → Configuration/Environment is required; structure_spec.md 'Golden Relationships' → Config-Code separation
  - Verification criteria: PASS if environment-specific values are injected, not hardcoded. FAIL if business logic contains literal URLs, ports, or API keys

- **CQ-O-03** [P2] Is observability (logging, metrics, tracing) implemented?
  - Inference path: domain_scope.md 'Required Concept Categories' → Observability → undiagnosable issues if missing; concepts.md 'Observability' → Logging, Metrics, Tracing
  - Verification criteria: PASS if structured logging, metrics, and distributed tracing are present. FAIL if production issues cannot be diagnosed from telemetry

- **CQ-O-04** [P2] Are deployment strategies defined with rollback procedures?
  - Inference path: concepts.md 'DevOps' → Blue-Green, Canary, Rolling; domain_scope.md 'Major Sub-areas' → Operations and maintenance
  - Verification criteria: PASS if deployment strategy includes rollback procedures and health check criteria. FAIL if deployments are all-or-nothing

- **CQ-O-05** [P2] Are SLIs/SLOs defined for critical paths?
  - Inference path: concepts.md 'Observability' → SLI/SLO/SLA; domain_scope.md 'Major Sub-areas' → Operations and maintenance
  - Verification criteria: PASS if critical paths have defined SLIs with target SLOs. FAIL if no quantitative service level targets exist

- **CQ-O-06** [P3] Are the 12-Factor App principles addressed?
  - Inference path: domain_scope.md 'Reference Standards and Frameworks' → 12-Factor App, SRE, DORA
  - Verification criteria: PASS if each factor is addressed (compliance or documented deviation). FAIL if not assessed for cloud-deployed services

- **CQ-O-07** [P2] Can each deployed release artifact be traced back to source, build, verification, approval, and environment?
  - Inference path: concepts.md 'DevOps Terms' → Build Artifact, Artifact Attestation, Release Artifact Traceability; dependency_rules.md 'AI Supply Chain and Provenance' for AI-generated release inputs
  - Verification criteria: PASS if deployed artifacts can be traced to source revision, build pipeline, dependency set/SBOM where applicable, verification results, approval gate, and deployment environment. FAIL if production code identity or release provenance cannot be reconstructed

---

## 8. AI Agent and LLM-Native Collaboration (CQ-A)

Verifies that specifications support AI agent execution and LLM-native software workflows — self-contained, unambiguous, verifiable, and diagnosable. Applicable when AI agents are consumers/executors or when product/development/review behavior depends on model calls, prompt/context contracts, retrieval, tool use, or semantic evaluation.

- **CQ-A-01** [P1] Is the specification that an AI agent executes self-contained?
  - Inference path: concepts.md 'Document Design Terms' → Self-contained Spec required when AI agents are executors; domain_scope.md 'Major Sub-areas' → Documentation and consumers
  - Verification criteria: PASS if every AI-executed spec includes all necessary context without depending on other sessions or implicit knowledge. FAIL if the spec requires absent context

- **CQ-A-02** [P1] Are verification criteria for AI-generated output defined at the "ambiguity detection" level?
  - Inference path: logic_rules.md 'Constraint Design Logic' → free-text pass_criteria fail modes: partial fulfillment, arbitrary interpretation; structure_spec.md 'Verification Structure' → "what to verify" and "how verified" must be separate
  - Verification criteria: PASS if verification uses concrete, measurable criteria (not subjective assessment). FAIL if criteria allow partial fulfillment or arbitrary interpretation

- **CQ-A-03** [P2] Are reading paths specified for AI vs human documentation consumers?
  - Inference path: domain_scope.md 'Major Sub-areas' → Documentation and consumers; concepts.md 'Document Design Terms' → Contract Document vs Guide Document
  - Verification criteria: PASS if contract (machine-readable) and guide (human-readable) content are structurally separated. FAIL if specs and explanations are mixed without separation

- **CQ-A-04** [P2] Is constraint design for AI tasks using pre-inclusion rather than post-verification?
  - Inference path: logic_rules.md 'Constraint Design Logic' → pre-inclusion > post-verification for quality assurance
  - Verification criteria: PASS if constraints are embedded in generation directives. FAIL if constraints exist only as post-generation checklists

- **CQ-A-05** [P3] Are inter-agent contracts specified as typed interfaces?
  - Inference path: structure_spec.md 'Golden Relationships' → Module-Interface coherence; logic_rules.md 'Inter-module Contract Logic' → API changes affect consumers
  - Verification criteria: PASS if inter-agent communication uses typed schemas. FAIL if agents communicate via unstructured natural language

- **CQ-A-06** [P3] Is AI agent autonomy explicitly bounded?
  - Inference path: domain_scope.md 'Major Sub-areas' → LLM-native and agentic behavior; prompt_interface.md 'Agent Permission and Autonomy'
  - Verification criteria: PASS if agent permissions define autonomous scope, human-approval scope, and prohibited actions. FAIL if scope is undefined

- **CQ-A-07** [P1] Are LLM model/provider/version facts recorded where behavior must be reproducible?
  - Inference path: concepts.md 'LLM-Native Engineering Terms' → Model Provider and Model Version; logic_rules.md 'LLM Boundary Logic' → model/provider facts are external dependency facts
  - Verification criteria: PASS if runs or configs record provider, model id/version or alias status, auth/route realization, and capability requirements. FAIL if a model behavior change cannot be traced to a concrete provider/model fact

- **CQ-A-08** [P1] Are prompt templates, context assembly rules, and output schemas versioned and reviewable?
  - Inference path: logic_rules.md 'LLM Boundary Logic' → prompt/context artifacts are behavior-affecting; concepts.md 'Prompt Template' and 'Context Assembly'
  - Verification criteria: PASS if prompt/context/schema changes are tracked like code/config and have an owner or artifact seat. FAIL if runtime behavior depends on unversioned prompt text or hidden context assembly logic

- **CQ-A-09** [P1] Does LLM-native failure handling fail-loud instead of silently degrading in development, review, or authority paths?
  - Inference path: logic_rules.md 'LLM-Native Failure Posture' → default fail-loud; concepts.md 'Silent Degradation'
  - Verification criteria: PASS if malformed output, missing context, invalid tool result, schema mismatch, provider preflight failure, and unbudgeted truncation halt or produce structured diagnostics. FAIL if fallback/repair hides the origin or presents degraded output as complete

- **CQ-A-10** [P2] Is semantic evaluation defined for non-deterministic model or agent output?
  - Inference path: concepts.md 'Semantic Evaluation'; domain_scope.md 'Major Sub-areas' → LLM-native and agentic behavior
  - Verification criteria: PASS if golden set, rubric, baseline, comparison method, or human review path exists for output quality. FAIL if only route success, schema validity, or exact-match tests are used to claim quality

- **CQ-A-11** [P2] Do agent tools and MCP boundaries have self-describing schemas and validated results?
  - Inference path: logic_rules.md 'LLM Boundary Logic' → Agent and Tool Rules; structure_spec.md 'LLM-Native System Structure'
  - Verification criteria: PASS if tool schemas include applicability, parameters, result shape, failure semantics, and result validation. FAIL if agents must infer tool use from hidden docs or consume unchecked tool output

- **CQ-A-12** [P2] Can evidence-backed LLM output trace claims to source provenance?
  - Inference path: logic_rules.md 'LLM Boundary Logic' → Retrieved context used as evidence must carry source provenance
  - Verification criteria: PASS if evidence-backed claims cite retrieved context or artifact refs. FAIL if generated claims are treated as evidence without source provenance

- **CQ-A-13** [P3] Are graceful degradation paths explicit product behavior rather than hidden development shortcuts?
  - Inference path: logic_rules.md 'LLM-Native Failure Posture' → graceful degradation allowed only as explicit product behavior
  - Verification criteria: PASS if degraded behavior declares trigger, lost capability, visible marker, diagnostic artifact, and recovery path. FAIL if fallback exists only to keep the run passing

- **CQ-A-14** [P1] Are LLM, runtime, and middleware ownership boundaries explicit and non-overlapping?
  - Inference path: concepts.md 'LLM-Native Engineering Terms' → domain projections for LLM Boundary, Runtime Boundary, Middleware Boundary, Ownership Non-Interference; logic_rules.md 'LLM Boundary Logic' → operational prohibitions; prompt_interface.md 'Ownership Boundary Structure' → interface obligations
  - Verification criteria: PASS if semantic judgment, deterministic binding/validation/persistence, and transport/adaptation responsibilities are declared with forbidden crossovers. FAIL if runtime or middleware silently performs semantic repair, middleware becomes hidden policy authority, or LLM output bypasses runtime-owned authority, persistence, authorization, idempotency, or cost/security gates

- **CQ-A-15** [P1] Is LLM output treated as untrusted until validated for the concrete downstream sink?
  - Inference path: concepts.md 'Output Zero-Trust' and 'Sink Validation'; logic_rules.md 'Output Zero-Trust Rules'; prompt_interface.md 'Output Sink Constraints'
  - Verification criteria: PASS if every shell, SQL, HTML, file, email, API/tool, and authority-artifact sink has explicit validation/encoding/authorization before use. FAIL if schema validity or prompt instructions are treated as sufficient safety for downstream use

- **CQ-A-16** [P1] Is external content prevented from injecting instructions that change tool permission, role authority, output authority, or secret disclosure behavior?
  - Inference path: concepts.md 'Prompt Injection Boundary'; logic_rules.md 'External Content and Prompt Injection Rules'; prompt_interface.md 'External Content Handling'
  - Verification criteria: PASS if external content is framed as data, instruction hierarchy is runtime-enforced, exfiltration sinks are blocked or approved, and at least one prompt-injection scenario is tested when tool/authority impact exists. FAIL if the model alone is trusted to ignore hostile retrieved/user/web/file content

- **CQ-A-17** [P1] Does retrieval/RAG preserve permission, source validation, poisoning resistance, provenance, and auditability before context injection?
  - Inference path: concepts.md 'RAG Permission Boundary' and 'Embedding Index Compatibility'; logic_rules.md 'Retrieval and Vector Rules'; structure_spec.md 'LLM-Native System Structure'
  - Verification criteria: PASS if retrieval filters by user/tenant/sensitivity before context assembly, records source/retrieval provenance, validates ingestion, handles embedding/index compatibility, and audits retrieval paths. FAIL if retrieved text can cross permission boundaries or become evidence without provenance

- **CQ-A-18** [P2] Are agent functionality, permission, and autonomy minimized separately?
  - Inference path: concepts.md 'Agent Functionality', 'Agent Permission', and 'Agent Autonomy'; logic_rules.md 'Agent and Tool Rules'; prompt_interface.md 'Agent Permission and Autonomy'
  - Verification criteria: PASS if available tools, authorized scope, and no-approval autonomy are separately declared with high-impact approval gates. FAIL if broad tool availability is treated as permission or permission is treated as autonomous approval

- **CQ-A-19** [P2] Can a model/provider, prompt/context, tool, or retrieval-corpus change be evaluated as a behavior migration?
  - Inference path: dependency_rules.md 'LLM/Agent Dependency Management' and 'AI Supply Chain and Provenance'; concepts.md 'Behavior-Affecting Artifact'
  - Verification criteria: PASS if impacted prompts, tool schemas, retrieval indexes, eval baselines, dashboards, cost/rate assumptions, and release gates are listed or explicitly non-applicable. FAIL if the change is treated as an implementation detail with no semantic regression path

- **CQ-A-20** [P2] Does semantic evaluation distinguish route success, schema validity, quality, safety, and production drift?
  - Inference path: concepts.md 'Semantic Evaluation', 'Evaluation Baseline', and 'Production Drift'; logic_rules.md 'AI Governance and Risk Rules'
  - Verification criteria: PASS if the system separates deterministic pass/fail, schema validation, semantic quality, safety/security testing, and drift monitoring. FAIL if successful model invocation is used as evidence of output quality

---

## 9. Security (CQ-SE)

Verifies that authentication, authorization, input validation, and supply chain security are addressed.

- **CQ-SE-01** [P1] Are authentication mechanisms correctly implemented?
  - Inference path: logic_rules.md 'Security Logic' → Authentication Logic → token validation: structure, signature, expiration, issuer, audience → skipping any = vulnerability; domain_scope.md 'Major Sub-areas' → Security and authorization
  - Verification criteria: PASS if token validation checks all five steps and sessions have absolute/idle timeouts with invalidation on password change. FAIL if any step is skipped or sessions lack expiration

- **CQ-SE-02** [P1] Is authorization enforced at the correct granularity (not just authentication)?
  - Inference path: domain_scope.md 'Major Sub-areas' → Security and authorization; domain_scope.md 'Bias Detection Criteria' → security scope bias: auth without authz = full access
  - Verification criteria: PASS if every protected resource checks user permission level. FAIL if only "is logged in" is checked without "has permission"

- **CQ-SE-03** [P1] Is input validation applied at system boundaries with defense in depth?
  - Inference path: logic_rules.md 'Security Logic' → Input Validation Logic → defense in depth; Injection prevention → parameterized queries, output encoding
  - Verification criteria: PASS if validation occurs at boundaries AND inner layers (parameterized queries, output encoding, CSP) are in place. FAIL if single-layer validation or string concatenation for SQL

- **CQ-SE-04** [P2] Is the authorization model documented with policy conflict resolution?
  - Inference path: logic_rules.md 'Security Logic' → Authorization Logic → deny-overrides, permit-overrides, first-applicable; concepts.md 'Security' → RBAC vs ABAC
  - Verification criteria: PASS if authorization model is documented with explicit conflict resolution strategy. FAIL if multiple policies apply with no resolution order

- **CQ-SE-05** [P2] Are dependency security audits automated in CI?
  - Inference path: dependency_rules.md 'Build/Package Dependency Rules' → Dependency Security → audit in CI; domain_scope.md 'Major Sub-areas' → Security and authorization
  - Verification criteria: PASS if `npm audit` / `pip audit` or equivalent runs in CI with critical vulnerabilities blocking merge. FAIL if no automated scanning

- **CQ-SE-06** [P2] Are OWASP Top 10 risks systematically addressed?
  - Inference path: domain_scope.md 'Major Sub-areas' → Security and authorization; domain_scope.md 'Reference Standards and Frameworks' → OWASP Top 10 for web-facing systems
  - Verification criteria: PASS if assessed against OWASP Top 10 with mitigations documented. FAIL if no assessment for web-facing systems

- **CQ-SE-07** [P2] Are sensitive and personal data classified, minimized, and protected according to their handling obligations?
  - Inference path: concepts.md 'Security Terms' → Data Classification, Data Minimization; domain_scope.md 'Major Sub-areas' → Security and authorization
  - Verification criteria: N/A if the system processes no personal, sensitive, tenant-scoped, regulated, or secret-bearing data. PASS if data classes, minimization rationale, access controls, encryption/redaction, logging policy, and retention/deletion obligations are documented and enforced. FAIL if sensitive data is collected, stored, logged, or exposed without classification and handling rules

---

## 10. Performance (CQ-P)

Verifies that performance requirements are defined, measured, and validated. Scale-dependent — small systems may not need all of these.

- **CQ-P-01** [P2] Are performance targets defined as measurable SLOs?
  - Inference path: domain_scope.md 'Major Sub-areas' → Verification and quality; concepts.md 'Observability' → SLI/SLO
  - Verification criteria: PASS if critical paths have targets (e.g., p99 < 500ms). FAIL if no performance targets for production endpoints

- **CQ-P-02** [P2] Is cached data tied to a declared source of truth and staleness tolerance?
  - Inference path: domain_scope.md 'Required Concept Categories' → Source of truth; concepts.md 'Data/State Management Terms' → Eventual Consistency
  - Verification criteria: PASS if each cache declares its authoritative source, owner, consumers, allowed staleness, and inconsistency resolution rule. FAIL if cached data exists without source-of-truth or staleness semantics

- **CQ-P-03** [P2] Is load testing performed for expected and peak traffic?
  - Inference path: domain_scope.md 'Major Sub-areas' → Verification and quality; structure_spec.md 'Quantitative Thresholds' → P99 > 1s triggers review
  - Verification criteria: PASS if load tests simulate expected/peak traffic with results compared to SLOs. FAIL if no load testing for concurrent-user systems

- **CQ-P-04** [P3] Are common performance anti-patterns (N+1, unindexed, unbounded) identified?
  - Inference path: structure_spec.md 'Storage/Data Layer'; domain_scope.md 'Major Sub-areas' → Verification and quality
  - Verification criteria: PASS if anti-patterns detected by tooling or review. FAIL if known anti-patterns exist in production without mitigation

- **CQ-P-05** [P2] Is caching invalidation strategy defined with consistency guarantees?
  - Inference path: logic_rules.md §Performance Logic → Caching Rules → cache invalidation strategies; dependency_rules.md §Source of Truth Management
  - Verification criteria: PASS if each cache has an invalidation or refresh mechanism (TTL, event-based invalidation, versioned keys, write-through/update, or documented manual refresh) that is compatible with its declared staleness tolerance. FAIL if cache entries can remain stale beyond the declared tolerance or invalidation triggers are undefined

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

- **CQ-C-05** [P2] Are concurrent resource limits defined with behavior at capacity?
  - Inference path: domain_scope.md 'Required Concept Categories' → Concurrency; logic_rules.md §Concurrency Logic → Concurrency Model Rules; dependency_rules.md §Runtime Dependency Rules → Bulkhead and Timeout and Retry Policies
  - Verification criteria: PASS if connection pools, thread pools, queues, actor mailboxes, worker pools, or other concurrent capacity limits declare behavior at saturation. FAIL if resource exhaustion under concurrent load leads to undefined blocking, dropped work, retry storms, or unbounded memory growth

---

## 12. Dependencies (CQ-DE)

Verifies that dependency management is sound — direction rules enforced, external dependencies managed, build reproducibility guaranteed.

- **CQ-DE-01** [P1] Is the dependency graph acyclic?
  - Inference path: dependency_rules.md 'Acyclic Dependencies' → ADP → DAG required; dependency_rules.md 'Breaking Cycles' → inversion, events, shared kernel strategies
  - Verification criteria: PASS if dependency graph is verified acyclic by tooling. FAIL if circular dependencies exist. Type-only circular imports are WARNING

- **CQ-DE-02** [P1] Do dependencies follow the declared architecture's direction rule and dependency kind?
  - Inference path: dependency_rules.md 'Direction Rules' → dependency direction vocabulary, pattern selection rule, DIP, Clean Architecture, Hexagonal Architecture, Stable Dependencies Principle
  - Verification criteria: PASS if source-code, runtime-flow, and contract dependencies are classified and each source-code edge follows the declared architecture's rule. FAIL if a single global upper/lower rule is applied across Layered, Clean, Hexagonal, and DIP contexts or if business policy depends on concrete infrastructure without accepted rationale

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

- **CQ-DE-07** [P2] Are event schema contract dependencies owned, versioned, and decommissionable?
  - Inference path: dependency_rules.md 'Breaking Cycles' → Event-based decoupling; dependency_rules.md 'Event Schema Contract Dependencies'; competency_qs.md 'Event/Messaging'
  - Verification criteria: N/A if the system has no event/message/pub-sub path. PASS if each event/message schema has an owner, versioning policy, compatibility rules, producer/consumer direction, migration window for breaking changes, and decommissioning path. FAIL if event-based decoupling hides consumer coupling, stale subscribers, or schema ownership gaps

- **CQ-DE-08** [P2] Are general software supply-chain artifacts traceable and verifiable outside AI-specific provenance?
  - Inference path: concepts.md 'DevOps Terms' → SBOM, Artifact Attestation, Release Artifact Traceability; dependency_rules.md 'Build/Package Dependency Rules' → Dependency Security; domain_scope.md 'Reference Standards and Frameworks' → SLSA and NIST SSDF
  - Verification criteria: PASS if build/release artifacts have dependency inventory, license/security checks, signature or attestation where required, and provenance verification tied to CI/release gates. FAIL if only AI artifacts have provenance while conventional build/release artifacts lack traceability

## 13. Boundary Conditions (CQ-B)

Verifies that edge cases, limits, and boundary values are identified and handled.

Scope boundary: CQ-B addresses **value-level boundaries** (min/max, empty, overflow). Type-level safety mechanisms belong to CQ-T. Concurrency resource limits under load belong to CQ-C.

- **CQ-B-01** [P1] Are boundary values (min/max, empty, null) identified and tested for each input?
  - Inference path: domain_scope.md 'Required Concept Categories' → Boundary condition → edge case failures; logic_rules.md §Error Handling Logic → Error Classification → operational errors include validation failure
  - Verification criteria: PASS if each input has documented boundary values with tests for min, max, empty, and null cases. FAIL if boundary values are not identified or only happy-path values are tested

- **CQ-B-02** [P1] Are integer overflow/underflow risks identified in arithmetic operations?
  - Inference path: domain_scope.md 'Required Concept Categories' → Boundary condition → integer overflow in payment calculation; logic_rules.md §Type System Logic → type safety
  - Verification criteria: PASS if arithmetic operations on user-influenced values use overflow-safe types or explicit checks. FAIL if arithmetic can overflow silently (e.g., 32-bit integer for monetary values)

- **CQ-B-03** [P2] Are collection size boundaries handled (empty collections, single-element, maximum size)?
  - Inference path: domain_scope.md 'Required Concept Categories' → Boundary condition → empty array dereference; logic_rules.md §Constraint Design Logic → schema validation at entry point
  - Verification criteria: PASS if operations on collections handle empty, single-element, and maximum-size cases. FAIL if code assumes non-empty collections without validation

---

## 14. Requirements & Specification (CQ-R)

Verifies that requirements are captured, testable, and traceable. Applicable when formal requirements management is practiced.

Scope boundary: CQ-R addresses **requirements traceability and quantification**. Test strategy and coverage belong to CQ-V.

- **CQ-R-01** [P2] Is each functional requirement traceable to at least one test or verification method?
  - Inference path: domain_scope.md §Major Sub-areas → Interface and contract; structure_spec.md §Golden Relationships → Test-Code coherence
  - Verification criteria: PASS if a traceability matrix (or equivalent) links requirements to tests. FAIL if requirements exist without corresponding verification

- **CQ-R-02** [P2] Are non-functional requirements quantified with measurable targets?
  - Inference path: domain_scope.md §Major Sub-areas → Interface and contract + Verification and quality
  - Verification criteria: PASS if NFRs have numeric targets (e.g., p99 < 500ms, 99.9% availability). FAIL if NFRs are stated qualitatively ("should be fast")

- **CQ-R-03** [P2] Are accessibility and internationalization requirements explicit when user-facing scope requires them?
  - Inference path: domain_scope.md 'Major Sub-areas' → Accessibility and internationalization; concepts.md 'Internationalization/Accessibility Terms'
  - Verification criteria: N/A if the system has no user-facing surface, locale-sensitive output, public/regulatory exposure, or assistive-technology obligation. PASS if accessibility level, supported locales, text direction, formatting, translation ownership, and acceptance criteria are explicit. FAIL if user-facing scope exists but accessibility/i18n requirements are absent or purely qualitative

- **CQ-R-04** [P1] Are user-visible, API, or release-affecting behaviors expressed as testable acceptance criteria?
  - Inference path: domain_scope.md 'Major Sub-areas' → Interface and contract; structure_spec.md 'Golden Relationships' → Documentation-Code alignment; logic_rules.md 'Constraint Design Logic' → free-text pass_criteria failure modes
  - Verification criteria: PASS if externally observable or release-affecting behavior has acceptance criteria specific enough to verify. FAIL if behavior is described only as intent, narrative, or qualitative preference with no concrete expected result, non-goal, or verification method

---

## 15. Maintenance (CQ-MT)

Verifies that maintenance processes are defined and classified. Applicable when the system has an established user base with ongoing development.

- **CQ-MT-01** [P2] Are maintenance activities classified by type (corrective/adaptive/perfective/preventive)?
  - Inference path: domain_scope.md §Domain Purpose → full lifecycle; ISO/IEC/IEEE 12207 in domain_scope.md §Reference Standards and Frameworks; concepts.md §Change Management Terms → Technical Debt
  - Verification criteria: PASS if maintenance work is classified and tracked by type with distinct workflows. FAIL if all maintenance is treated as undifferentiated "bug fixes"

- **CQ-MT-02** [P2] Is technical debt tracked with remediation plans?
  - Inference path: domain_scope.md §Top-Down Concern Stack → Lifecycle and governance; concepts.md §Interpretation Principles → "Technical debt" is not "code I don't like"
  - Verification criteria: PASS if technical debt items are documented with estimated cost and remediation priority. FAIL if technical debt is acknowledged informally but not tracked

- **CQ-MT-03** [P2] Is retirement or decommissioning complete across runtime, docs, data, dependencies, and operations?
  - Inference path: domain_scope.md §Domain Purpose → decommissioning and retirement; extension_cases.md Case SE-07; concepts.md §Change Management Terms → Deprecation and Feature Toggle
  - Verification criteria: N/A if no feature, service, API, model, prompt, tool, index, datastore, or dependency is being retired. PASS if communication, dependency removal, route/flag cleanup, documentation updates, data retention/deletion, monitoring cleanup, and final verification are complete or explicitly retained with rationale. FAIL if retired behavior survives as stale routes, flags, docs, alerts, data obligations, indexes, or consumers without rationale

---

## 16. Event/Messaging (CQ-M)

Verifies that asynchronous messaging patterns are correctly implemented. Applicable when the system uses message queues, event buses, or pub/sub patterns.

Scope boundary: CQ-M addresses **messaging infrastructure and delivery semantics**. Data flow traceability belongs to CQ-D.

- **CQ-M-01** [P1] Is the message delivery guarantee explicitly chosen and its trade-offs documented?
  - Inference path: domain_scope.md §Major Sub-areas → Architecture and structure; logic_rules.md §State Management Logic → determinism
  - Verification criteria: PASS if delivery guarantee is documented with justification. FAIL if the guarantee is implicit or unknown

- **CQ-M-02** [P1] Are message consumers idempotent when at-least-once delivery is used?
  - Inference path: concepts.md §Quality Terms → Idempotent; logic_rules.md §State Management Logic → determinism
  - Verification criteria: PASS if consumers handle duplicate messages safely (idempotency keys, deduplication). FAIL if duplicate processing causes side effects

- **CQ-M-03** [P2] Is message ordering guaranteed where business logic requires it?
  - Inference path: domain_scope.md §Major Sub-areas → Architecture and structure; logic_rules.md §State Management Logic → Fundamental State Rules → same input must produce same output
  - Verification criteria: PASS if ordering-sensitive operations use partitioned/ordered channels. FAIL if ordering is assumed but not enforced

- **CQ-M-04** [P2] Are dead-letter queues configured for unprocessable messages?
  - Inference path: logic_rules.md §Error Handling Logic → Error Classification → operational errors; domain_scope.md §Required Concept Categories → Error path
  - Verification criteria: PASS if failed messages are routed to DLQ with monitoring. FAIL if unprocessable messages are silently dropped or block the queue

---

## 17. AI Governance, Provenance, and Value Alignment (CQ-G)

Verifies that AI-era software behavior has accountable ownership, evidence, incident feedback, and explicit value tradeoffs. Applicable when AI behavior materially affects users, operators, release decisions, security/privacy, authority artifacts, or engineering workflow.

- **CQ-G-01** [P1] Is there an accountable owner for material AI risk?
  - Inference path: concepts.md 'AI Governance' and 'AI Risk Owner'; domain_scope.md 'Axiology Input'; logic_rules.md 'AI Governance and Risk Rules'
  - Verification criteria: PASS if the risk owner, risk treatment, approval/acceptance gate, and review cadence are named or explicitly non-applicable. FAIL if AI risk is treated as an implicit engineering side effect with no accountable owner

- **CQ-G-02** [P1] Do generated or retrieved authority-affecting artifacts preserve provenance?
  - Inference path: concepts.md 'Provenance' and 'Generated Artifact'; dependency_rules.md 'AI Supply Chain and Provenance'; structure_spec.md 'Provenance record'
  - Verification criteria: PASS if source refs, builder/agent, inputs, transformation path, verification state, and relevant model/provider facts are recorded. FAIL if generated or retrieved claims become authority without traceable evidence

- **CQ-G-03** [P2] Do red-team findings, semantic eval failures, incidents, and drift signals feed back into controls?
  - Inference path: concepts.md 'Red-Team/Eval Loop'; structure_spec.md 'Red-team/incident loop'; logic_rules.md 'AI Governance and Risk Rules'
  - Verification criteria: PASS if findings can update prompts, policies, tests, evals, guardrails, release gates, or incident playbooks with an owner. FAIL if findings are recorded but cannot change the system

- **CQ-G-04** [P2] Is fail-loud chosen where diagnosability and artifact truth matter more than apparent continuity?
  - Inference path: domain_scope.md 'Axiology Input'; logic_rules.md 'LLM-Native Failure Posture'; concepts.md 'Fail-Loud' and 'Silent Degradation'
  - Verification criteria: PASS if development/review/authority paths halt or emit diagnostic artifacts on contract failure, and product degradation visibly marks loss and recovery. FAIL if the system optimizes for a smooth demo by hiding trust loss, missing evidence, or failing boundaries

- **CQ-G-05** [P2] Are human approval and user/operator agency preserved for high-impact AI actions?
  - Inference path: concepts.md 'Human Approval Gate' and 'Agent Autonomy'; structure_spec.md 'Human approval gate'; prompt_interface.md 'Agent Permission and Autonomy'
  - Verification criteria: PASS if high-impact actions have approval, denial, audit, and recovery paths. FAIL if an agent can independently perform irreversible, external, privileged, or user-affecting actions without an explicit gate or risk acceptance

- **CQ-G-06** [P3] Are lifecycle and standards anchors current enough for the target's risk?
  - Inference path: domain_scope.md 'Reference Standards and Frameworks' and 'Top-Down Concern Stack'
  - Verification criteria: PASS if requirements, quality, accessibility, AI governance, secure development, and lifecycle references use current anchors or justify older references. FAIL if outdated standards or implementation-only scope hide acquisition, operation, maintenance, retirement, accessibility, or governance obligations

- **CQ-G-07** [P2] Are AI transparency and incident disclosure paths defined for affected stakeholders?
  - Inference path: concepts.md 'AI Incident Disclosure'; domain_scope.md 'AI governance and risk'; extension_cases.md Case AI-06
  - Verification criteria: N/A if AI behavior cannot materially affect users, operators, release decisions, security/privacy, authority artifacts, or trust claims. PASS if disclosure audience, trigger, timing, content, artifact/audit refs, remediation communication, and trust-status display are defined. FAIL if material AI failures can occur without a communication path to affected users, operators, or internal stakeholders

---

## Related Documents
- domain_scope.md — top-level scope definition and bias detection criteria
- concepts.md — term definitions for type system, architecture, testing, security, etc.
- logic_rules.md — rules for types (CQ-T), state (CQ-D), security (CQ-SE), concurrency (CQ-C), testing (CQ-V), AI agent and LLM-native collaboration (CQ-A)
- structure_spec.md — rules for module structure (CQ-S), golden relationships (CQ-V), verification pipeline (CQ-V), thresholds (CQ-S)
- logic_rules.md §Error Handling Logic — inference path target for CQ-B boundary condition questions
- domain_scope.md §Domain Purpose and §Top-Down Concern Stack — inference path targets for CQ-MT maintenance questions
- dependency_rules.md — rules for dependency direction (CQ-DE), API management (CQ-I), build dependencies (CQ-DE), runtime dependencies (CQ-E)
- domain_scope.md §Sub-area to CQ Mapping — mapping between scope sub-areas and CQ sections
- prompt_interface.md — interface criteria for prompt/context/tool/output/sink boundaries used by CQ-A and CQ-G
