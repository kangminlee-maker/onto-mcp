---
version: 6
last_updated: "2026-05-28"
source: bundled-domain-baseline
status: established
---

# Software Engineering Domain — Structure Specification

Classification axis: **structural component** — specifications classified by the structural element they govern.

## Required Module Structure Elements

- **Entry Point**: the public interface through which users/external systems access the system
- **Business Logic**: the core layer implementing domain rules. Minimize external dependencies
- **Data Access**: a layer that abstracts interactions with the storage
- **Configuration/Environment**: manage environment-specific settings separately from code

## Architectural Patterns

### Hexagonal Architecture (Ports and Adapters)

- **Structure**: Business logic at the center. Ports define interfaces (inbound: use cases the system exposes, outbound: services the system needs). Adapters implement ports (inbound: REST controller, CLI handler; outbound: PostgreSQL repository, S3 file store)
- **Dependency rule**: See dependency_rules.md §Direction Rules (domain depends on nothing external; adapters depend on ports, ports depend on domain)
- **When to use**: Systems with multiple input channels (API, CLI, event consumer) or multiple output targets (different databases, external services). Real example: Netflix's microservice architecture uses hexagonal architecture per service — each service exposes ports for its API and has adapters for databases, caches, and other services

### Clean Architecture

- **Structure**: Concentric layers — Entities (innermost) → Use Cases → Interface Adapters → Frameworks/Drivers (outermost)
- **Dependency rule**: See dependency_rules.md §Direction Rules (source code dependencies must point inward; inner layers must not know about outer layers)
- **When to use**: Applications where business rules must survive framework changes. If replacing the web framework requires changing business logic, the architecture is violated

### Vertical Slice Architecture

- **Structure**: Organize code by feature, not by layer. Each feature contains its own handler, validator, data access, and tests in a single directory or namespace
- **Trade-off**: Reduces cross-cutting concerns (a change to feature A does not touch feature B's files) at the cost of potential code duplication between slices
- **When to use**: Teams working independently on different features. Reduces merge conflicts. Real example: used in large monorepos where feature teams own specific directories

### Modular Monolith

- **Structure**: Single deployment unit with strict module boundaries. Each module has a public API (exposed interfaces) and private internals. Modules communicate through public APIs, not by reaching into each other's internals
- **Boundary enforcement**: Module boundaries can be enforced via packaging (Java modules, Go packages), access modifiers, or architectural fitness functions (ArchUnit, dependency-cruiser)
- **When to use**: When a microservice architecture's operational complexity is not justified, but strong boundaries between components are needed. Real example: Shopify's modular monolith — a large Rails application with enforced module boundaries, using Packwerk for boundary checking

## Required Relationships

- See §Golden Relationships for module-interface, test-code, and config-code coherence rules.
- External dependencies must follow dependency_rules.md. Use owned interfaces, ports, adapters, or anti-corruption layers when replacement, testing, security, policy isolation, or model translation matters. Direct coupling to a stable or low-risk dependency may be accepted with an explicit tradeoff rationale
- When structural verification (code) and execution procedures (protocol) are in separate documents, the linking reference must be back-referenced in the protocol document for enforcement to be complete

## Golden Relationships

Golden relationships are cross-component validation rules. Each rule connects two structural components that must remain consistent with each other. A violation indicates a structural defect.

- **Module-Interface coherence**: Every module must expose its contract via a public interface (exported types, function signatures). Internal implementation details must not leak through the interface. If a consumer depends on an internal implementation detail, the module boundary is violated. Verification: check that imports from a module only reference its public API surface
- **Test-Code coherence**: Every public function must have at least one corresponding test. Untested public functions are unverified contracts — they may not behave as their signature suggests. Verification: measure public function coverage, not line coverage. Cross-reference: logic_rules.md 'Testing Logic'
- **Config-Code separation**: No hardcoded values in business logic. Configuration values (URLs, thresholds, feature flags, credentials) must be injected. Hardcoded values cannot be changed without code deployment. Verification: search for literal strings in business logic that match environment-specific patterns (URLs, ports, API keys)
- **Schema-Code alignment**: Data access code must match the schema definition. If the schema defines a column as NOT NULL and the code treats it as nullable, the mismatch will cause runtime failures. If the schema is migrated (column renamed, type changed), all data access code must be updated atomically. Verification: schema migration CI checks (e.g., sqlc, Prisma migration validation)
- **Documentation-Code alignment**: API documentation (OpenAPI, GraphQL schema) must match the implementation. If the documentation says a field is required but the code treats it as optional, consumers will experience unexpected behavior. Real example: Stripe generates API documentation from the same schema that generates server-side validation code, ensuring alignment by construction

## Layer Structure Principles

Layer dependency direction rules are defined in dependency_rules.md §Direction Rules. There is no single global "upper -> lower" rule:

- Conventional layered architecture may allow presentation/application layers to depend on lower service/data-access layers.
- Clean and Hexagonal architectures constrain source-code dependencies to point inward or toward ports/abstractions.
- Runtime call/data-flow direction is separate from source-code dependency direction.
- Reviews must apply the direction rule for the declared architecture pattern and dependency kind.

## Authority and Layer Separation

- Distinguish **definition authority** (what exists) from **specification authority** (how it behaves). The direction of change is definition -> specification -> code
- An intermediate abstraction layer is justified only when 2 or more consumers directly consume that layer. With only 1 consumer, it only adds indirection cost
- "Type of detail" (semantic/structural/implementation) and "placement of detail" (layer 1/2/3) are independent axes. Conflating them causes unnecessary conflicts
- Boundary criterion between "definition document" and "specification document": "Would misunderstanding this lead to misinterpreting the intent?"

## Classification Criteria Design

### Package/Module Organization Axes

- **By layer**: controllers/, services/, repositories/, models/. All REST controllers in one directory, all database access in another. Advantage: easy to find all code of a certain type. Disadvantage: a single feature change touches many directories
- **By feature (vertical)**: user/, order/, payment/. Each directory contains the controller, service, repository, and model for that feature. Advantage: a feature change touches one directory. Disadvantage: cross-cutting concerns (logging, auth) have no natural home
- **By bounded context**: inventory-context/, billing-context/, shipping-context/. Each context is a self-contained module with its own models, services, and data access. Advantage: strong boundary enforcement, independent evolution. Disadvantage: requires upfront domain analysis to identify context boundaries

### When to Use Each

| Organization Axis | Project Size | Team Structure | Change Pattern |
|---|---|---|---|
| By layer | Small (<10K LOC) | Single team | Most changes are cross-cutting |
| By feature | Medium (10K–100K LOC) | Feature teams | Most changes are feature-specific |
| By bounded context | Large (>100K LOC) | Domain teams | Contexts evolve independently |

### Anti-patterns

- **Mixed classification axes at the same level**: e.g., `src/controllers/`, `src/user/`, `src/utils/` — mixing by-layer, by-feature, and by-type at the same directory level. This makes it impossible to predict where to find code
- **Premature bounded contexts**: Splitting into bounded contexts before the domain is well understood creates boundaries in the wrong places. Start with by-feature organization and extract bounded contexts as the domain model stabilizes

## Naming Conventions

### File Naming

| Ecosystem | Convention | Example |
|---|---|---|
| JavaScript/TypeScript | camelCase or kebab-case (project-specific) | `userService.ts` or `user-service.ts` |
| Python | snake_case | `user_service.py` |
| Java/Kotlin | PascalCase (matches class name) | `UserService.java` |
| Go | snake_case (lowercase) | `user_service.go` |
| Ruby | snake_case | `user_service.rb` |

Consistency within a project is more important than following ecosystem conventions. Choose one convention and enforce it via linting.

### Function/Method Naming

- **Actions**: verb-first. `createUser()`, `validateInput()`, `sendNotification()`. The verb indicates what the function does
- **Getters/Accessors**: noun or `get` prefix. `userName()` or `getUserName()`. Some languages have conventions (Kotlin: `val name`, Java: `getName()`)
- **Boolean returns**: `is`/`has`/`can`/`should` prefix. `isValid()`, `hasPermission()`, `canRetry()`, `shouldRefresh()`. Without the prefix, the return type is not obvious from the name: `valid()` could return a validation result object
- **Factory methods**: `create`/`of`/`from` prefix. `createFromConfig()`, `of(value)`, `fromJSON(str)`

### Constant Naming

- `UPPER_SNAKE_CASE` for constants in most languages: `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS`
- Rationale: visual distinction from mutable variables. A reader immediately knows the value does not change
- Exception: Kotlin uses `val` with PascalCase for top-level constants by convention

### Boolean Naming

- Variables: `is`/`has`/`can`/`should` prefix. `isEnabled`, `hasError`, `canProceed`
- Avoid negation in boolean names: `isDisabled` is harder to reason about than `isEnabled` (double negation: `if (!isDisabled)` is confusing)

## Quantitative Thresholds

These thresholds are structural health indicators derived from industry practice. Exceeding a threshold does not automatically indicate a defect, but requires review and explicit justification.

| Metric | Threshold | Implication | Action |
|---|---|---|---|
| Module/File size | > 500 lines | File likely contains multiple responsibilities | Review for splitting by responsibility |
| Function/Method size | > 50 lines | Function likely does more than one thing | Review for extraction |
| Cyclomatic complexity | > 10 per function | Function has too many independent paths | Refactor by extracting conditions or using polymorphism |
| Dependency fan-out | > 7 direct dependencies per module | Module is coupled to too many others | Review for facade or mediator pattern |
| Dependency fan-in | > 20 dependents | Module is a change bottleneck | Review for stability (should be abstract/interface) |
| Test coverage (line) | < 80% | Insufficient verification of behavior | Increase coverage, prioritizing public API paths |
| Test coverage (line) | < 60% | Critical verification gap | Immediate action required |
| API response time | P99 > 1s | Performance degradation | Performance review and optimization |
| Class inheritance depth | > 5 levels | Inheritance hierarchy is too deep | Prefer composition over inheritance |
| Agent tool count | > 20 tools per agent | Tool selection quality drops and routing becomes non-deterministic | Split tools, add routing, or narrow the agent role |
| Prompt template length | > 25% of target context window | User input/retrieved evidence/output schema may be squeezed or truncated | Refactor prompt, move stable material to refs, or choose a larger context model |

Cross-reference: logic_rules.md 'Testing Logic' (test boundary rules inform coverage measurement strategy).

## LLM-Native System Structure

This section applies when a software system, development workflow, or review workflow depends on LLMs, agents, prompt/context contracts, retrieval, model providers, or tool-call boundaries.

### Required Components

| Component | Structure | Failure if Missing |
|---|---|---|
| Model connection | Provider/client boundary with model id, auth mode, version, rate-limit handling | The system cannot reproduce or explain model behavior |
| Prompt/context assembly | Prompt templates, instruction hierarchy, context sources, token budget, output schema | Model input becomes an unreviewable prompt blob |
| Output validation and sink gates | Schema validation, semantic checks, sink-specific validation/encoding/authorization, trust boundary, failure artifact | Malformed or unsafe output becomes trusted behavior or unsafe downstream input |
| Evaluation harness | Golden set, rubric, baseline, comparison method | Route success is mistaken for output quality |
| Observability | Prompt/output/model/tool facts, correlation id, cost, latency, failure reason | Failures become expensive to diagnose |
| Provenance record | Source refs, builder/agent, inputs, transformation path, verification state, model/provider facts | Generated or retrieved claims become unverifiable authority |
| Ownership boundary map | LLM semantic delegation, runtime deterministic gates and authority seats, middleware transport/adaptation, trust status, diagnostics | LLM, runtime, or middleware can silently take over another layer's authority |

### Optional Components Required When Applicable

| Component | Required When | Structure |
|---|---|---|
| Retrieval/RAG pipeline | External knowledge is selected for model context | ingestion -> processing -> indexing -> retrieval -> reranking/context handoff, with provenance at each stage |
| RAG permission layer | Retrieved material crosses users, tenants, projects, sensitivity classes, or authority levels | pre-context permission filtering, source validation, poison checks, retrieval audit, redaction/exclusion path |
| Agent tool registry | An LLM can choose actions or call tools | tool name, purpose, parameter schema, result shape, failure semantics, permission boundary |
| Agent state/progress | Work spans multiple steps, tools, or sessions | explicit state object or artifact with completed/current/remaining steps and accumulated refs |
| Multi-agent profile | Multiple reasoning units collaborate | coordination pattern, isolated inputs/outputs, termination conditions, conflict-resolution authority |
| Safety guardrails | User input, model output, or agent action can cause harm | input guardrail, output guardrail, action permission model, logging, false-positive review path |
| AI governance record | AI behavior materially affects users, operators, release, security, privacy, or authority artifacts | risk owner, risk treatment, approval gate, human oversight, transparency/audit evidence |
| Red-team/incident loop | AI behavior can fail semantically, disclose data, mislead users, or trigger unsafe action | test scenario, finding intake, incident disclosure path, remediation owner, updated prompt/policy/eval/release gate |
| Human approval gate | Agent output or action is high-impact, irreversible, external, privileged, or user-affecting | approver role, approval input, audit record, denial path, idempotency or rollback expectation |

### Golden Relationships

- **Model capability -> prompt/tool requirement**: The chosen model must support the prompt's required capabilities: context length, structured output, tool use, modality, and reasoning level. If not, invocation must fail-loud before dispatch or record a degraded route explicitly
- **Retrieved context -> evidence claim**: Any evidence-backed claim must trace to retrieved context provenance. Generated text without provenance may be a draft but not evidence
- **Tool schema -> agent instruction**: Every tool named in agent instructions must exist with a valid schema, and every exposed tool must either be referenced by an agent role or justified as discoverable reserve capacity
- **Evaluation baseline -> production drift**: Production quality drift detection must compare against an evaluation baseline. Monitoring without a baseline cannot classify quality movement
- **External content -> model context**: Any external content entering model context must pass through context assembly that preserves instruction hierarchy and treats the content as data, not authority
- **LLM semantic output -> runtime authority gate -> middleware adapter**: LLM output may provide semantic input, but runtime owns validation, authority-seat assembly, persistence, authorization, idempotency, and cost/security gates. Middleware may adapt envelopes, routes, and observability plumbing, but must not repair meaning, become hidden policy authority, or bypass runtime-owned gates
- **Agent capability -> permission -> autonomy**: Capability, authorization, and approval are distinct structure seats. A design that exposes a tool without separately declaring permission and autonomy is structurally under-specified
- **AI risk -> owner -> gate -> feedback loop**: Material AI risk must connect to an owner, approval or acceptance gate, incident/red-team intake, and update path for controls or evals

## Verification Structure

### Static Analysis Integration

- **Linting**: Enforces code style and catches common errors. Runs on every file save (IDE integration) and on every commit (pre-commit hook). Zero-tolerance for linting errors in CI — a linting failure blocks merge
- **Type checking**: Verifies type correctness at compile time (compiled languages) or via external tools (TypeScript `tsc`, Python `mypy`). Type errors are logic errors — they indicate a contract violation. Cross-reference: logic_rules.md 'Type System Logic'
- **Dependency analysis**: Tools like dependency-cruiser (JS), ArchUnit (Java), or go vet (Go) verify that dependency rules are not violated. Detects layer inversions and circular dependencies. Cross-reference: dependency_rules.md 'Direction Rules'

### CI/CD Pipeline Structure

| Stage | What It Verifies | When It Runs | Failure Impact |
|---|---|---|---|
| Pre-commit | Formatting, linting, type checking | Before code enters the repository | Blocks commit |
| CI Build | Compilation, unit tests, static analysis | On every push / PR | Blocks merge |
| Integration Test | Cross-component interaction | On PR to main branch | Blocks merge |
| Staging Deploy | End-to-end tests in production-like environment | After merge to main | Blocks production deploy |
| Production Deploy | Smoke tests, health checks | During/after deployment | Triggers rollback |

### Verification Boundary Rules

- **Pre-commit**: Only fast checks (<10 seconds). Slow checks in pre-commit cause developers to bypass hooks. Formatting and linting belong here. Full test suites do not
- **CI**: All automated checks that can run without a deployed environment. Unit tests, integration tests with in-memory dependencies, static analysis, dependency checks
- **Deployment**: Checks that require a running environment. Health checks, smoke tests, canary analysis
- When delegating a verification plan to AI, "what to verify" (pass_criteria) and "how it was verified" (evidence_type) must be separate fields for audit traceability

## Isolated Node Prohibition

- Public function/class with no callers -> warning (dead code)
- Module that is not imported -> warning (isolated module)
- Public API without tests -> warning (verification gap)
- Declared but unreachable state -> warning

## Storage/Data Layer

- Data sources (DB, API, files) must be separated from business logic
- Schema changes must be managed through migrations
- Data integrity rules (constraints) must be verified on both the application and storage sides. Cross-reference: logic_rules.md 'Constraint Design Logic' (Database vs Application Constraint Boundary)

## Related Documents
- concepts.md — term definitions for module, interface, layer, architecture patterns, etc.
- dependency_rules.md — dependency direction and circular dependency rules, build/package dependency management
- logic_rules.md — type system logic, constraint design, security logic, testing logic
- prompt_interface.md — prompt, role, tool, response format, and context interface criteria
- competency_qs.md — CQ-S-01~CQ-S-10 (Structural Understanding verification questions)
