---
version: 6
last_updated: "2026-05-28"
source: bundled-domain-baseline
status: established
---

# Software Engineering Domain — Dependency Rules

Classification axis: **linkage type** — dependencies and connections classified by the type of relationship between components.

## Acyclic Dependencies

### Acyclic Dependencies Principle (ADP)

The dependency graph of packages/modules must be a Directed Acyclic Graph (DAG). If cycles exist, there is no valid build order, and changes in one module propagate unpredictably through the cycle.

- Module dependency graph: acyclic (DAG). Cycles make build order undeterminable and initialization order indeterminate
- Package/library dependencies: acyclic. Circular dependencies prevent deployment units from being separated
- Type-only imports and value imports must be distinguished. Type-only imports do not cause runtime cycles and are therefore evaluated at a separate severity level
- **Build order implication**: A DAG can be topologically sorted — this sort defines the build order. If module A depends on B, B must be built before A. Cycles make topological sort impossible, which is why build systems reject circular dependencies

### Breaking Cycles

When a circular dependency is detected, apply one of the following strategies:

- **Dependency Inversion**: If module A depends on module B and B depends on A, extract an interface from the dependency direction that should be reversed. Module A defines the interface; module B implements it. The dependency direction reverses: B now depends on A's interface, breaking the cycle. Cross-reference: 'Direction Rules' (Dependency Inversion Principle)
- **Event-based decoupling**: Replace direct calls with events. Module A publishes an event; module B subscribes. Neither module imports the other. The event schema becomes the contract and must follow §Event Schema Contract Dependencies. Appropriate when the interaction is asynchronous or fire-and-forget
- **Shared kernel**: Extract the shared types/functions that both modules need into a third module. Both A and B depend on the shared module, but not on each other. Appropriate when the cycle is caused by shared type definitions. Cross-reference: 'Package/Module Dependency Patterns' (Shared Kernel pattern)
- Real example: npm detects circular dependencies at install time and logs a warning. Go prohibits import cycles entirely — the compiler rejects them. Python allows circular imports but they cause `ImportError` at runtime if the cycle involves module-level code execution

## Direction Rules

Direction rules apply to a specific dependency kind and architecture pattern. Do not use
one global "upper/lower" vocabulary for every architecture.

### Dependency Direction Vocabulary

- **Source-code dependency**: import, reference, build, type, package, or generated-code edge. This is the edge most architecture rules constrain.
- **Runtime call/data-flow direction**: request, command, query, event, or data movement at runtime. Runtime flow may move opposite to source-code dependency.
- **Policy/detail direction**: high-level policy/business rules versus low-level implementation detail. This is the axis governed by DIP and Clean/Hexagonal architecture.
- **Layer order direction**: presentation/application/service/data-access placement in a conventional layered architecture. This is not the same axis as policy/detail.
- **Contract dependency**: dependence on a schema, port, interface, message format, or published language. Contract dependency can break direct implementation cycles only when the contract has explicit ownership and compatibility rules.

### Pattern Selection Rule

- If a codebase declares Clean Architecture or Hexagonal Architecture, source-code dependencies must follow the inward/port-oriented rule for that pattern.
- If a codebase declares conventional Layered Architecture, source-code dependencies may flow from presentation/application layers toward lower service/data-access layers, but business policy should still depend on abstractions for replaceable infrastructure.
- If no architecture pattern is declared, reviews must first classify the intended pattern before applying direction rules. A reviewer must not mix Clean/Hexagonal and conventional layered direction rules on the same edge without an explicit adapter/port explanation.

### Conventional Layered Architecture Direction

- Presentation/API layer -> application/service layer: allowed.
- Application/service layer -> data-access layer: allowed only through repository/service contracts when replacement, testing, or policy isolation matters.
- Data-access/infrastructure layer -> application/business layer: prohibited unless it is a callback, plugin, or dependency-injection registration with an explicit boundary.
- Runtime data flow from lower layers back to upper layers as returned values or events does not imply source-code dependency in that direction.

### Dependency Inversion Principle (DIP)

High-level modules must not depend on low-level modules. Both must depend on abstractions. Abstractions must not depend on details. Details must depend on abstractions.

- High-level and low-level describe policy/detail roles, not directory height or UI/data-access layer position.
- Policy/business logic -> concrete infrastructure detail: prohibited unless explicitly accepted as a small/simple-system tradeoff.
- Policy/business logic -> abstraction/port: allowed.
- Infrastructure detail -> abstraction/port it implements: allowed.
- Business logic -> direct dependency on external library: discouraged; abstract via interface/port when replacement, testing, security, or policy isolation matters.
- Test -> production code: allowed
- Production code -> test: prohibited

### Clean Architecture Dependency Rule

Source code dependencies must point inward. The innermost layer (Entities/Domain) depends on nothing. The outermost layer (Frameworks/Drivers) depends on everything inward. No inner layer may import, reference, or name anything from an outer layer. Cross-reference: structure_spec.md 'Architectural Patterns' (Clean Architecture)

### Hexagonal Architecture Dependency Rule

Domain/application logic owns or depends on ports. Adapters depend on the ports and implement or call them. Domain/application logic must not depend on concrete adapter implementations. Runtime calls may enter through inbound adapters or leave through outbound adapters, but source-code dependencies remain toward the domain/ports side.

### Stable Dependencies Principle (SDP)

Depend in the direction of stability. A module should depend only on modules that are more stable (harder to change) than itself. Stability is measured by the ratio of incoming dependencies (afferent coupling) to total dependencies. A module with many dependents and few dependencies is stable — changing it would break many consumers, so it resists change.

- If a volatile module (frequently changed) depends on another volatile module, changes cascade unpredictably
- If a stable module depends on a volatile module, the stable module is forced to change when the volatile module changes, contradicting its stability
- Real example: Spring Framework's `@Autowired` — the application code depends on Spring's stable interfaces (DI container), not on specific implementation classes. NestJS providers follow the same pattern. Go achieves this through implicit interface satisfaction — any type that implements the methods of an interface satisfies it, without declaring the dependency

### Stable Abstractions Principle (SAP)

A package should be as abstract as it is stable. Stable packages (many dependents) should consist primarily of interfaces and abstract classes, so that dependents can extend them without modifying them. Volatile packages (few dependents) should be concrete, containing implementations.

- A stable, concrete package is a problem: it is hard to change (many dependents) and impossible to extend (no abstractions)
- An abstract, volatile package is a problem: it has abstractions that nobody uses

## Type Location and Dependency Direction

- When shared types are defined in a specific module, unintended dependency directions are created. Placing shared types at the lowest dependency layer is structurally safe
- The module location of a type definition implicitly declares that type's contract level. When the consumer is at the system's external boundary, maintaining it as a kernel contract is advantageous for intent preservation
- Moving a type to the consumer module can cause the producer to depend on the consumer, resulting in a structural constraint violation

## Diamond Dependencies

- A diamond of the form A -> B, A -> C, B -> D, C -> D: allowed (provided D's versions match)
- Simultaneous dependency on different versions of the same module: prohibited (version conflict)
- Resolution: the dependency management system must select a single version. npm uses tree deduplication (hoisting); Go uses minimum version selection; Maven uses "nearest definition wins." Each strategy has different conflict behavior

## Package/Module Dependency Patterns

### Shared Kernel

- Extract types/functions that multiple modules need into a dedicated "kernel" module. Both depend on the kernel, not on each other
- The shared kernel must be small and change infrequently. Frequent changes make it a bottleneck
- Real example: shared protobuf/gRPC definitions placed in a dedicated schema repository

### Anti-corruption Layer

- When integrating with an external system whose model does not match the internal domain, create an adapter layer that translates between the two. Policy/domain code depends on an internal port or translated internal model; the adapter depends on the external model and performs translation at the boundary. Runtime flow may cross the adapter, but source-code dependency from policy/domain code to a concrete adapter is prohibited in Clean/Hexagonal designs
- Real example: Stripe SDK wraps Stripe's REST API with typed objects matching the consumer's language idioms

### Published Language

- When two systems exchange data, define a shared contract (schema, message format) that both agree to. Neither side's internal model leaks through the contract. Versioned independently
- Real example: Protocol Buffers `.proto` files — both client and server generate code from the same definition

### Event Schema Contract Dependencies

- Event producer and consumer must depend on a versioned event/message schema or published language, not on each other's implementation details
- The event schema must have an owner, versioning policy, compatibility rules, and decommissioning path
- Producers must not shape events around consumer-only implementation needs. Consumers must tolerate compatible additions and ignore unknown fields where the format permits
- Breaking event schema changes require consumer impact analysis, migration or dual-publish/dual-read window, and stale-subscriber detection
- Event schema dependencies should be represented as contract dependencies in dependency graphs so event-based decoupling does not hide a semantic cycle

### Conformist

- When a dependency's model cannot be changed (third-party API, legacy system), the consumer adopts the dependency's model as-is. Simplest pattern but creates tight coupling
- Real example: AWS SDK — consumers conform to AWS's API model (ARNs, IAM policy format) rather than translating

## API Dependency Management

### REST API Versioning Strategies

| Strategy | Mechanism | Trade-off |
|---|---|---|
| URL path versioning | `/api/v1/users`, `/api/v2/users` | Simple routing but pollutes URI space. Most common in practice (GitHub, Stripe, Google) |
| Header versioning | `Accept: application/vnd.api.v2+json` | Clean URLs but harder to test (requires custom headers). Used by GitHub API |
| Query parameter | `/api/users?version=2` | Simple but easy to forget. Rarely used for major versioning |
| Content negotiation | Media type includes version | Most RESTful but complex implementation |

Real example: Stripe uses URL path versioning combined with API version dates (`Stripe-Version: 2023-10-16`). Each API version is a snapshot of the API's behavior. Old versions are maintained indefinitely.

### gRPC Backward Compatibility Rules

- **Field numbering**: Never reuse a field number after removing a field. Mark removed fields as `reserved`. Reusing a number causes existing clients to misinterpret the data
- **Field evolution**: Adding a new field is backward compatible (old clients ignore unknown fields). Removing a required field is a breaking change. Changing a field's type is a breaking change
- **`oneof` evolution**: Adding a new field to a `oneof` is backward compatible. Removing a field from a `oneof` is a breaking change
- **Service evolution**: Adding a new RPC method is backward compatible. Removing or renaming an RPC method is a breaking change

### GraphQL Schema Evolution

- Adding a new field to a type is backward compatible (existing queries do not request it)
- Removing a field is a breaking change (existing queries that request it will fail). Use `@deprecated(reason: "Use fieldX instead")` before removal
- Adding a required argument to a field is a breaking change. Adding an optional argument is backward compatible
- Schema stitching and federation introduce cross-service schema dependencies. A change in one service's schema can break the composed schema

### Breaking vs Non-breaking Changes Classification

| Change Type | Breaking? | Explanation |
|---|---|---|
| Add optional field | No | Existing consumers ignore it |
| Add required field | Yes | Existing consumers do not send it |
| Remove field | Yes | Existing consumers still expect it |
| Rename field | Yes | Equivalent to remove + add |
| Change field type | Yes | Existing consumers send/expect wrong type |
| Widen value range | No | Existing consumers send a subset |
| Narrow value range | Yes | Existing consumers may send invalid values |
| Add enum value | Depends | Breaking if consumers use exhaustive matching |

Cross-reference: logic_rules.md 'Type System Logic' (enum/union breaking changes); logic_rules.md 'Inter-module Contract Logic' (backward compatibility rules).

## Runtime Dependency Rules

### Service Discovery Patterns

- **DNS-based**: Services registered in DNS (e.g., `user-service.internal`). Simple but DNS TTL causes stale entries; no health checking
- **Service registry (Consul, Eureka, etcd)**: Services register and discover through a registry with health checking. Registry itself must be clustered to avoid single point of failure
- **Sidecar proxy (Envoy, Istio)**: Proxy co-located with each service handles discovery, routing, load balancing. Language-agnostic but adds operational complexity

### Circuit Breaker

- When a dependency fails repeatedly, stop sending requests (open circuit). After a timeout, allow a probe request (half-open). If it succeeds, close; if it fails, re-open
- Key thresholds: failure rate (e.g., 50%), minimum request count before evaluating (e.g., 20), open-state timeout (e.g., 30s)
- Real example: Resilience4j (JVM), Envoy proxy (infrastructure level)

### Bulkhead

- Isolate resources (thread pools, connection pools) between dependencies. If one dependency exhausts its allocation, others are unaffected
- Without bulkheads, one slow dependency can consume all connection pool entries, causing cascading failure

### Timeout and Retry Policies

- Every outbound call must have an explicit timeout. Without it, an unresponsive dependency blocks indefinitely
- **Exponential backoff with jitter**: Wait 2^n * base_delay + random jitter. Prevents thundering herd (synchronized retries after failure)
- **Maximum retries**: 2-3 for idempotent operations, 0 for non-idempotent (unless idempotency keys are used). Unlimited retries overload recovering dependencies

## Build/Package Dependency Rules

### Lock File Management

- Lock files (`package-lock.json`, `yarn.lock`, `Pipfile.lock`, `go.sum`, `Cargo.lock`) must be committed to version control. They ensure deterministic builds — every developer and CI system installs exactly the same dependency versions
- Without a lock file, `npm install` or `pip install` may resolve to different versions at different times, causing "works on my machine" failures
- Lock file conflicts during merge should be resolved by running the package manager's install/lock command, not by manually editing the lock file

### Dependency Resolution Algorithms

- **SAT solving (npm, pip)**: The dependency resolver models version constraints as a boolean satisfiability problem and finds a compatible set of versions. Can handle complex constraints but may be slow for large dependency trees. npm v7+ uses a tree-building algorithm with deduplication
- **Minimum version selection (Go)**: Always selects the minimum version that satisfies all constraints. Produces reproducible builds without a lock file (go.sum verifies checksums, not versions). Simpler and more predictable than SAT solving, but requires all modules to declare accurate minimum versions
- **Nearest definition wins (Maven)**: In a diamond dependency, the version declared closest to the root of the dependency tree wins. Can produce surprising results when transitive dependencies declare different versions

### Transitive Dependency Management

- **Peer dependencies (npm)**: Package requires a specific version installed by the consumer, not by itself. Used for plugins. npm v7+ warns if missing
- **Optional dependencies**: Enhance functionality but are not required. Package must function if absent. Checked at runtime with try/catch on import
- **Phantom dependencies**: npm/Yarn hoist shared dependencies to root `node_modules`, allowing code to import undeclared packages. pnpm prevents this with strict `node_modules` structure

### Dependency Security

- **Audit**: Run `npm audit`, `pip audit`, or equivalent in CI. Critical vulnerabilities (RCE, data breach): fix immediately. High: within days. Medium: within sprint
- **Supply chain security**: Verify integrity via checksums (go.sum), signatures (Sigstore), and SBOM generation. Real example: `event-stream` npm incident (2018) — malicious dependency added by compromised maintainer
- **Update strategy**: Dependabot/Renovate create PRs for updates. Auto-merge patches (semver-compatible), manual review for minor/major. Full test suite required on every update PR

### Release Artifact Provenance

- Build and release artifacts must be traceable to source revision, build workflow, dependency inventory, verification result, approval gate, and deployment environment
- SBOMs and attestations are release dependencies when downstream consumers, operators, compliance, incident response, or security review depend on reconstructing what was shipped
- Provenance for conventional build/release artifacts is not optional merely because the system also records AI-generated artifact provenance. AI provenance and release provenance answer different trust questions and both must be present when both artifact types affect authority or release
- A release gate that verifies only package installation or test success is incomplete when the release claim requires signed artifacts, dependency inventory, vulnerability status, or reproducible build evidence

## Referential Integrity

- A module referenced by import/require must actually exist
- All types referenced in a public API must be exported
- Environment variables referenced in configuration must actually be defined
- When the same function name exists in multiple files, limiting the search scope to a specific file when enumerating change targets causes omissions structurally. The full search (grep) results must be stated to prevent scope mismatch

## Source of Truth Management

- When data collection input paths number 3 or more, the consumption timing and source of truth designation for each path are required
- When migrating a source of truth, if the existing document's "definition authority" rules and the new system's source of truth declaration coexist, the dependency direction becomes duplicated. The existing rules must also be updated during migration
- When data is delivered through two paths — event stream (structural state) and file (semantic context) — the priority in case of inconsistency must be specified as a contract

## External Dependency Management

- Production dependencies and development-only dependencies must be distinguished (dependencies vs devDependencies)
- External API calls must declare failure semantics: retry, timeout, circuit breaker, explicit degraded behavior, or fail-loud/fail-close behavior. A fallback is required only when the product contract promises continued reduced service
- The license of external dependencies must be compatible with the project license
- For detecting changes from external-service-based sources, using service-provided metadata (lastModified, etc.) is advantageous for preventing false positives
- A pattern that concentrates external interface definitions in a single file (like MCP tool definitions) is prone to growing into a God Module. A distributed registration pattern maintains correct dependency directions

### LLM/Agent Dependency Management

- Model provider APIs are external dependencies. Breaking changes include model deprecation, behavior changes between pinned versions, pricing changes, rate-limit changes, auth changes, and response-format changes
- Model/provider migration requires impact analysis across prompt templates, tool schemas, retrieval policy, evaluation baselines, production dashboards, and cost budgets
- MCP server schemas are API contracts. New required tool parameters, result-shape changes, removed tools, or changed failure semantics are breaking changes for agents and hosts
- Embedding model changes require re-indexing stored vectors. Embeddings from different models are not comparable, so partial migration must keep old and new indexes separated until cutover
- LLM framework upgrades can change default prompts, chunking, routing, retry, or output parsing behavior. Treat framework defaults as behavior-affecting dependencies and verify against the semantic evaluation suite
- If an LLM dependency is unavailable during a development/review/authority path, the default is fail-loud. A fallback may run only if the contract declares its lost capability, diagnostic artifact, and trust status

### AI Supply Chain and Provenance

- AI supply chain dependencies include model/provider, model version or alias, dataset/corpus, embedding model, embedding index, prompt framework, eval judge, tool runtime, safety layer, generated artifact builder, and generated artifact inputs
- Generated artifacts that affect authority, release, security, user decisions, or review outcomes must preserve provenance: source refs, builder/agent, input set, transformation path, verification state, and relevant model/provider facts
- Evaluation datasets, rubrics, AI-as-judge prompts, and judge models are dependencies. Changing any of them can change apparent quality without changing product behavior
- Retrieval corpora are dependencies, not passive content. Corpus ingestion, source lifecycle, tenant/user permissions, poisoning controls, and deletion/retention rules affect behavior and trust
- Prompt packages, system instructions, and tool descriptions are behavior dependencies. If they are injected from host configuration, the host route must be treated as a dependency boundary
- A dependency update that changes LLM behavior must be evaluated with semantic regression evidence or an explicit risk acceptance. Package version success alone is insufficient

### Dependency Direction for AI Boundaries

- Runtime may depend on prompt/context/tool configuration as input artifacts, but prompt text must not become the runtime authority for validation, authorization, persistence, or idempotency
- Middleware may depend on runtime schemas for transport and envelope conversion, but middleware must not become the source of truth for semantic policy or artifact authority
- Agents may depend on tool schemas and capability descriptions, but tool implementations must not depend on agent natural-language reasoning for security or data integrity
- Retrieval output may depend on source corpora and indexes, but authority claims must depend on provenance-bearing refs, not on generated text alone

## Related Documents
- concepts.md — term definitions for dependency, source of truth, contract, API versioning, etc.
- structure_spec.md — layer structure principles, module structure rules, architectural patterns
- logic_rules.md — dependency logic, circular dependency rules, inter-module contract logic, security logic
- competency_qs.md — dependency verification questions
