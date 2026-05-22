---
version: 3
last_updated: "2026-03-31"
source: bundled-domain-baseline
status: established
---

# Software Engineering Domain — Domain Scope Definition

This is the reference document used by coverage to identify "what should exist but is missing."
This domain applies when **reviewing** a software system.

## Major Sub-areas

Classification axis: **concern** — classified by the design concerns that a software system must address.

Applicability markers:
- **(required)**: Must be addressed in any software system review. Absence indicates a fundamental gap
- **(when applicable)**: Address when the system's architecture includes the relevant pattern. Not addressing it when the pattern is absent is correct, not a gap
- **(scale-dependent)**: Becomes required beyond a scale threshold. The threshold should be documented per sub-area

### Data & State
- **Data Modeling** (required): entities, relationships, type definitions, schema design. Uber's Schemaless demonstrates schema-on-read (MySQL stores JSON blobs, schema evolution without migrations). Netflix EVCache handles 30M+ req/s, illustrating consistency vs availability trade-offs. Event Sourcing (Greg Young, EventStore) stores state as immutable event logs — Axon Framework implements this on the JVM with built-in CQRS. Data modeling must declare schema-on-write vs schema-on-read, as this determines migration strategy and consistency guarantees
- **State Management** (required): state transitions, invariants, recovery paths, concurrency control. CQRS (Command Query Responsibility Segregation) separates read and write models — the write side enforces invariants via commands, the read side serves optimized projections. Saga patterns (choreography vs orchestration) coordinate distributed state changes across service boundaries without distributed transactions
- **Event Sourcing** (when applicable): event storage, state reconstruction, projections, terminal states, partial commit prevention. Event Store (eventstore.com) provides a purpose-built database for event sourcing with built-in projections and subscriptions

### Interface & Contract
- **API Design** (required): public interfaces, versioning, contracts, backward compatibility. REST maturity is measured by Richardson's Maturity Model (L0: HTTP tunnel → L3: hypermedia/HATEOAS). GraphQL (Facebook, 2015) lets clients specify exact data shapes, solving over/under-fetching. gRPC (Google) uses Protocol Buffers for schema-first, strongly-typed RPC with HTTP/2 multiplexing. Stripe's rolling API versioning pins each customer to their integration version, avoiding the "upgrade cliff." OpenAPI/Swagger provides machine-readable specs enabling automated client generation and contract testing
- **Type System** (required): discriminated union, exhaustive check, type-level safety mechanisms. TypeScript's discriminated unions with exhaustive switch/case checking eliminate an entire class of runtime errors at compile time. Rust's `Result<T, E>` and `Option<T>` force callers to handle both success and failure paths (see also: concepts.md §Type Safety Mechanisms)
- **Error Handling** (required): error classification, recovery strategies, fallback paths, user guidance. Error classification should distinguish operational errors (expected, recoverable: network timeout, validation failure) from programmer errors (unexpected, non-recoverable: null dereference, assertion violation). Circuit breaker patterns (Netflix Hystrix, Resilience4j) prevent cascading failures by failing fast when downstream services are unhealthy
- **Requirements & Specification** (when applicable): functional and non-functional requirements capture, acceptance criteria, traceability from requirements to implementation. IEEE 830 (SRS) provides a standard format. Requirements must be testable — each requirement should map to at least one verification method. Non-functional requirements (performance, security, availability) must be quantified. Applicable when formal requirements management is practiced; implicit for small-team projects with clear verbal agreements

### Security & Auth
- **Authentication/Authorization** (required): user identification, permission systems, access control. OAuth 2.0/OIDC are the industry standards for delegated auth. JWT enables stateless authentication but requires careful token expiration, refresh rotation, and revocation handling. RBAC vs ABAC represent different authorization models — RBAC assigns permissions to roles, ABAC evaluates policies against attributes at runtime
- **Security** (required): input validation, injection prevention, data encryption, supply chain security. OWASP Top 10 (2021) classifies critical risks: A01 Broken Access Control through A10 SSRF. Log4Shell (CVE-2021-44228) demonstrated supply chain risk — a single Log4j vulnerability compromised millions of systems. The SolarWinds attack (2020) showed compromised build pipelines can inject malicious code into trusted updates, affecting 18,000+ organizations

### Verification & Quality
- **Test Strategy** (required): unit/integration/E2E coverage, verification criteria, test data management. Google's Testing Pyramid: many unit tests (fast, isolated), fewer integration tests (service boundaries), minimal E2E tests (slow, brittle). Fowler distinguishes sociable tests (real collaborators) from solitary tests (test doubles). Property-based testing (QuickCheck, Hypothesis, fast-check) generates random inputs to discover edge cases. Mutation testing (Stryker, PIT) validates test suite effectiveness by checking that tests catch injected mutations (see also: structure_spec.md §Verification Structure)
- **Verification Design** (when applicable): verification timing (shift-left), structural vs semantic verification, specification requirements when delegating to AI agents. Netflix Chaos Engineering (Chaos Monkey, 2011) injects failures in production to verify resilience — accepting failure as inevitable and testing recovery paths
- **Performance** (scale-dependent): response time, throughput, caching strategy. Load testing tools (k6, Gatling, Locust) simulate concurrent users to identify bottlenecks before production. Key metrics: p50/p95/p99 latency, throughput (RPS), error rate under load

### Structure & Architecture
- **Module Separation** (required): layer structure, dependency direction, separation of concerns. Hexagonal Architecture (Cockburn, 2005) isolates domain logic from infrastructure through ports and adapters, making the core testable without databases or HTTP. Clean Architecture (Robert C. Martin) enforces the Dependency Rule: dependencies point only inward. Domain-Driven Design (Evans, 2003) organizes code around bounded contexts. Microservices (Sam Newman) decompose systems into independently deployable services, trading operational complexity for deployment independence
- **Data Flow** (required): input-to-processing-to-output paths, transformation chains, source of truth designation. Pipe-and-filter architecture (Unix philosophy) composes systems from small, focused transformations. Event-driven architecture uses event buses (Kafka, RabbitMQ) to decouple producers from consumers
- **Event/Messaging** (when applicable): message queues, asynchronous processing, pipeline scalability. Apache Kafka provides durable, partitioned event logs enabling replay and exactly-once semantics. Message delivery guarantees (at-most-once, at-least-once, exactly-once) have fundamental trade-offs with latency and complexity

### Operations, Deployment & Maintenance
- **Deployment/Operations** (scale-dependent): CI/CD, environment separation, monitoring, logging. The 12-Factor App defines 12 principles for cloud-native applications (codebase, dependencies, config, backing services, build/release/run, processes, port binding, concurrency, disposability, dev/prod parity, logs, admin processes). GitOps (Weaveworks) uses Git as the single source of truth for declarative infrastructure. Feature flags (LaunchDarkly, Unleash) decouple deployment from release, enabling progressive rollouts without redeployment. Google SRE defines error budgets, SLIs/SLOs/SLAs, and toil reduction. DORA metrics (Deployment Frequency, Lead Time, Change Failure Rate, Time to Restore) measure delivery performance
- **Internationalization/Accessibility** (scale-dependent): multi-language, time zones, accessibility standards. **Applicability conditions**: Required when (1) the system serves users in multiple locales, (2) the system is subject to accessibility regulations (ADA, EAA, EN 301 549), or (3) the system is public-facing web/mobile. Not applicable for internal tools with a single-locale user base unless regulatory requirements mandate it. WCAG 2.1 defines A/AA/AAA conformance levels. ICU handles locale-aware formatting, collation, and transliteration. See concepts.md §Internationalization/Accessibility Terms for definitions
- **Maintenance** (when applicable): corrective maintenance (fixing defects discovered after delivery), adaptive maintenance (accommodating environment changes — OS upgrades, dependency updates, regulatory changes), perfective maintenance (improving performance/maintainability based on user feedback), preventive maintenance (refactoring to prevent anticipated problems). IEEE 14764 classifies these four categories. Technical debt management maps to preventive maintenance. Corrective/adaptive are reactive; perfective/preventive are proactive. See concepts.md §Change Management Terms for related terminology

### Documentation & Consumers
- **Document Design** (when applicable): dual-consumer handling for AI agents and humans, separation of contract documents vs guide documents, separation of information structure and rendering. Diátaxis classifies documentation into 4 types: tutorials (learning), how-to guides (task), reference (information), explanation (understanding). ADRs (Michael Nygard) capture the "why" behind architectural choices in structured format (context, decision, consequences). API-first design ensures contracts are defined before implementation
- **Constraint Design** (when applicable): hard/soft constraint classification, invariant vs best-effort boundary, pre-inclusion vs post-verification. Hard constraints: invariants that must never be violated (data integrity, security). Soft constraints: preferences relaxed under pressure (response time targets, cache hit ratios)

## Normative System Classification

Standards governing software engineering operate at three distinct layers. Each layer has different enforcement mechanisms and change velocity.

| Layer | Scope | Enforcement | Change Velocity | Examples |
|---|---|---|---|---|
| Layer 1 — Language/Runtime | Syntax, semantics, built-in APIs | Compiler/interpreter rejection | Slow (years) | ECMAScript, JLS, Go Spec, Rust Reference |
| Layer 2 — Framework/Library | Conventions imposed by frameworks | Runtime errors, lint rules | Medium (quarterly) | React hooks rules, Spring IoC, Rails conventions |
| Layer 3 — Industry/Organization | Cross-technology principles | Code review, audit | Fast (per incident) | OWASP Top 10, 12-Factor, SOLID, DDD patterns |

**Why this matters**: A review that cites only Layer 3 principles without checking Layer 1/2 conformance misses concrete, enforceable violations. Conversely, a review that only checks Layer 1/2 conformance without Layer 3 assessment misses systemic design issues.

## Required Concept Categories

These are concept categories that must be addressed in any software system.

| Category | Description | Risk if Missing | Example of Failure |
|---|---|---|---|
| Happy path | Normal behavior for expected inputs | Incomplete functional definition | API returns 200 but response body format is unspecified |
| Error path | Handling of abnormal inputs/states | Defenseless during failures | Unhandled exception crashes process; user sees raw stack trace |
| Boundary condition | Min/max values, empty inputs, concurrent access | Edge case failures | Integer overflow in payment calculation; empty array dereference |
| Lifecycle | Creation → use → disposal, state transitions | Resource leaks, zombie objects | Database connection pool exhaustion from unclosed connections |
| Traceability | Change rationale, decision justification, audit trail | Unmaintainable | 3-year-old conditional with no comment or commit message explaining why it exists |
| Source of truth | The authoritative data/definition source when inconsistencies arise | Unable to resolve information conflicts | User profile cached in 3 services diverges; no system is designated authoritative |
| Concurrency | Thread safety, race conditions, deadlock prevention | Data corruption under load | Two threads updating the same balance without locking; lost update |
| Idempotency | Operations that produce the same result when executed multiple times | Duplicate side effects | Payment charged twice because retry logic doesn't check for existing transaction |
| Observability | Logging, metrics, and tracing for runtime behavior | Silent failures, undiagnosable production issues | Error rate spikes but no logs indicate which endpoint or upstream service is responsible |

## Reference Standards/Frameworks

| Standard | Application Area | Usage | When to Apply |
|---|---|---|---|
| OWASP Top 10 (2021) | Security | Web application security vulnerability classification | Every web-facing system; review checklist for security |
| 12-Factor App | Deployment/Operations | Cloud-native application design principles | Cloud-deployed services; SaaS architecture review |
| REST Maturity Model (Richardson) | API Design | API design level assessment (L0–L3) | Reviewing or designing REST APIs |
| SOLID Principles | Module separation, type system | Five principles of object-oriented design | Object-oriented codebases; module boundary review |
| Event Sourcing Pattern | Event Sourcing | Event storage, state reconstruction, projections | Systems requiring full audit trail or temporal queries |
| Diátaxis Framework | Document Design | Tutorial/How-to/Reference/Explanation 4-way classification | Documentation review or creation |
| IEEE 830 (SRS) | Requirements | Software Requirements Specification format | Formal requirements documentation |
| ISO 25010 | Quality Model | Software quality characteristics (8 characteristics, 31 sub-characteristics) | System quality attribute assessment |
| TOGAF | Architecture | Enterprise architecture framework and ADM (Architecture Development Method) | Enterprise-scale architecture decisions |
| C4 Model (Simon Brown) | Architecture | 4-level architecture diagramming (Context, Container, Component, Code) | Architecture documentation and communication |
| Arc42 | Architecture | Pragmatic architecture documentation template (12 sections) | Documenting system architecture decisions |
| Domain-Driven Design (Eric Evans) | Structure & Architecture | Bounded contexts, aggregates, ubiquitous language | Complex domains with rich business logic |
| Google SRE Workbook | Operations | Error budgets, SLIs/SLOs, incident management | Production systems requiring reliability guarantees |
| IEEE 14764 | Maintenance | Software maintenance process and classification (corrective/adaptive/perfective/preventive) | Systems with ongoing maintenance operations |
| WCAG 2.1 | Accessibility | Web Content Accessibility Guidelines (A/AA/AAA conformance levels) | Public-facing web applications; legally mandated accessibility |

## Bias Detection Criteria

- If ⌈N/2.5⌉ or more of the Major Sub-areas (§Major Sub-areas) are not represented at all → **insufficient coverage**. **N** = the number of `###` subsections under §Major Sub-areas (count at review time — do not hard-code). At review time the reviewer counts the current `###` headings under §Major Sub-areas and computes the threshold from N, so adding or removing a sub-area updates the threshold automatically without editing this rule
- If concepts from a specific area account for more than 70% of the total → **area bias**
- If only the happy path is defined with no error path → **path bias**
- If creation/use is defined but disposal/cleanup is missing → **incomplete lifecycle**
- If 2 or more data sources lack a designated source of truth → **undesignated authority**
- If the document design area is missing in a system where AI agents are consumers/executors → **missing consumer perspective**
- If only synchronous request-response is considered with no async patterns (queues, events, callbacks) → **concurrency blindness**. Production systems require async for resilience and scalability
- If only server-side logic is addressed with no client-side considerations → **deployment bias**. Full-stack systems need design decisions on both sides of the network boundary
- If testing covers only unit tests with no integration or E2E strategy → **test level bias**. Each level catches different defect classes; missing any level leaves a verification gap (see also: structure_spec.md §Verification Structure)
- If security addresses only authentication without authorization → **security scope bias**. Auth without authz means every authenticated user has full access (OWASP A01)
- If only read operations are designed with no write/mutation considerations → **operation bias**. Ignoring write paths produces systems that fail under mutation load

## Inter-Document Contract

This section declares which file owns which cross-cutting topic, preventing rule duplication and phantom references.

### Rule Ownership

| Cross-cutting Topic | Owner File | Other Files |
|---|---|---|
| Dependency direction rules | dependency_rules.md | structure_spec.md (references only) |
| Backward compatibility classification | dependency_rules.md | logic_rules.md (references only) |
| Concept definitions | concepts.md | All other files reference, do not redefine |
| Structural coherence rules | structure_spec.md §Golden Relationships | Other files reference |
| Conciseness criteria | conciseness_rules.md | Other files reference |
| Competency questions | competency_qs.md | Other files provide inference path targets |
| Error handling design | logic_rules.md §Error Handling Logic | dependency_rules.md (cascading failure mechanisms) |
| Performance optimization rules | logic_rules.md §Performance Logic | structure_spec.md (thresholds), domain_scope.md (SLOs) |

### Required Substance per Sub-area

Each sub-area declared in Major Sub-areas must have corresponding substance in at least one of:
- concepts.md: term definitions
- logic_rules.md or structure_spec.md or dependency_rules.md: operational rules
- competency_qs.md: verification questions

A sub-area with declaration but no substance in any file is a "ghost sub-area" and must either be populated or annotated with applicability conditions.

### Cross-cutting Concern Attribution

When a concern spans multiple sub-areas, attribute it to the sub-area where the concern has its **primary enforcement point**:

1. **Primary enforcement point**: The sub-area whose rules would be violated if the concern is not addressed. Example: input validation spans Interface & Contract (API design) and Security & Auth (injection prevention). Primary enforcement: Security & Auth, because the security consequence is the enforcement driver
2. **Secondary references**: Other sub-areas reference the primary sub-area's rules rather than duplicating them
3. **Tie-breaking**: If enforcement is equally distributed, attribute to the sub-area with fewer existing items (load balancing)

### Classification Axis Relationships

The domain files use three related concern axes — they are facets of the same domain, not independent classification systems:

| File | Axis | Facet |
|---|---|---|
| domain_scope.md | concern | What design concerns exist (scope) |
| logic_rules.md | system construction concern | What concerns are governed by rules (rules) |
| competency_qs.md | verification concern | What concerns must be verified (questions) |

### Sub-area to CQ Section Mapping

| Sub-area | CQ Sections | Coverage |
|---|---|---|
| Data & State | CQ-D (Data Flow) | Full |
| Interface & Contract | CQ-I (Change Impact), CQ-E (Error Handling), CQ-R (Requirements) | Full |
| Security & Auth | CQ-SE (Security) | Full |
| Verification & Quality | CQ-V (Testing/Verification), CQ-P (Performance) | Full |
| Structure & Architecture | CQ-S (Structural Understanding), CQ-M (Event/Messaging) | Full |
| Operations, Deployment & Maintenance | CQ-O (Deployment/Operations), CQ-MT (Maintenance) | Full |
| Documentation & Consumers | CQ-A (AI Agent Collaboration) | Partial (AI-focused) |

Cross-cutting CQ sections (not mapped to a single sub-area):
- CQ-T (Types and Constraints) — spans Interface & Contract + Data & State
- CQ-B (Boundary Conditions) — spans all sub-areas
- CQ-C (Concurrency) — spans Data & State + Structure & Architecture
- CQ-DE (Dependencies) — spans Structure & Architecture + Operations

## Related Documents
- concepts.md §Architecture Core Terms — definitions of terms within this scope
- structure_spec.md §Required Module Structure Elements — specific rules for module structure, test organization
- competency_qs.md — questions this scope must be able to answer
