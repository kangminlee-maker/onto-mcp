---
version: 3
last_updated: "2026-03-31"
source: bundled-domain-baseline
status: established
---

# Software Engineering Domain — Logic Rules

Classification axis: **system construction concern** — rules classified by the design concern they govern in software systems.

## Type System Logic

### Fundamental Type Rules

- A contract declared by a type signature must be honored at runtime. A discrepancy between declaration and implementation is a logical contradiction
- Changing a field from optional to required is a breaking change. Changing from required to optional is backward compatible
- Adding a value to an enum/union is a breaking change from the consumer's perspective (breaks exhaustive switch)
- When a discriminated union and a string literal union represent the same entity in different files, an addition on one side may not cause a compile error on the other. The `default: never` pattern is the only safety mechanism
- Excluding state fields at the type level from failure branches (success:false) can block the propagation of partial state on failure at compile time

### Variance Rules

- **Covariant return types**: If method M returns type T, an overriding method may return a subtype of T. Safe because callers expect T and receive something more specific
- **Contravariant parameter types**: If method M accepts type T, an overriding method may accept a supertype of T. In practice, most languages (Java, C#, TypeScript) use invariant parameters instead
- **Invariant mutable references**: Mutable containers must be invariant. If `List<Cat>` were a subtype of `List<Animal>`, inserting a `Dog` via the `List<Animal>` reference would corrupt the collection. Java generics enforce this; Java arrays do not (covariant, throws `ArrayStoreException` at runtime)
- **Use-site variance**: Java uses `? extends T` (covariant read-only) and `? super T` (contravariant write-only). Kotlin and C# use declaration-site variance (`out T` / `in T`). Principle: restrict operations to guarantee type safety

### Generic Type Handling

- **Type erasure (Java)**: Generic type parameters are removed at compile time. `List<String>` and `List<Integer>` are the same type at runtime. Runtime type checks on generics are impossible; generic array creation is prohibited
- **Type reification (C#, Kotlin)**: Generic type parameters are preserved at runtime. Runtime type checks work, and generic operations depending on the type parameter are possible
- **Conditional types (TypeScript)**: `T extends U ? X : Y` — type-level branching based on assignability. Real example: Prisma generates conditional return types based on `select`/`include` parameters
- **Mapped types (TypeScript)**: `{ [K in keyof T]: ... }` — transforms each property of a type (`Partial<T>`, `Readonly<T>`). Real example: Stripe's SDK uses mapped types for type-safe API method signatures

### Structural vs Nominal Typing

See concepts.md §Type System Terms for definitions of structural and nominal typing.

- In structural type systems, accidental matches cause silent type confusion. Mitigation: branded types (`type UserId = string & { __brand: 'UserId' }`)
- In nominal type systems, explicit declaration relationships prevent accidental substitution — `UserId` and `OrderId` both wrapping `string` remain distinct

## State Management Logic

### Fundamental State Rules

- When state transitions are defined, the same input must always produce the same output (determinism)
- Mixing operations with side effects and operations without can cause results to vary depending on execution order
- In asynchronous operations, it must be verified whether race conditions are possible
- When a single business operation records multiple events in Event Sourcing, one of the following must be explicitly chosen to prevent partial commits: (1) composite event aggregation, (2) execute first then record at the end, or (3) saga pattern

### Distributed State Rules

- **CAP theorem implications**: In a distributed system experiencing a network partition, the system must choose between consistency (all nodes see the same data) and availability (all requests receive a response). This is not a design preference — it is a mathematical constraint. Real example: Amazon DynamoDB chooses availability (AP) with eventual consistency; Google Spanner chooses consistency (CP) with limited availability during partitions
- **Consensus protocols**: Paxos and Raft guarantee that a majority of nodes agree on a value. They require a quorum (majority) to be reachable. If fewer than a majority of nodes are available, the protocol blocks. Raft is preferred for new implementations because it is more understandable than Paxos while providing equivalent guarantees
- See concepts.md §Data/State Management Terms for optimistic and pessimistic locking definitions. Operational rules below:
- **Optimistic concurrency in practice**: Implemented via version numbers or ETags. Real example: Amazon DynamoDB conditional writes (`ConditionExpression` with version attribute) — the write succeeds only if the version matches, preventing lost updates. Appropriate when conflict probability is low
- **Pessimistic concurrency in practice**: Appropriate when conflict probability is high (e.g., inventory management for a flash sale) or when retry cost is high. Trade-off: simpler to reason about but reduces throughput

### Saga Pattern

- **Choreography**: Each service publishes an event after completing its step; the next service reacts. No central coordinator. Advantage: loose coupling. Disadvantage: hard to track overall progress. Appropriate for simple workflows (3-5 steps)
- **Orchestration**: A central orchestrator directs each step and handles compensation. Advantage: clear control flow, easier debugging. Disadvantage: orchestrator is a coordination bottleneck. Appropriate for complex workflows with branching
- **Compensation actions**: Every saga step must define a compensating action that semantically undoes the step's effect. Compensation is not rollback — it is a new forward action (e.g., "release inventory," not "undo the database write")

### CQRS Rules

- When read and write models are separated (CQRS), the read model is eventually consistent with the write model. The maximum acceptable lag must be defined as a system contract
- The write model is the source of truth. If the read model conflicts with the write model, the read model is stale, not incorrect
- Queries against the read model must not modify state. Commands against the write model must not return query results beyond an acknowledgment

## Constraint Design Logic

### Fundamental Constraint Rules

- When introducing hard/soft constraint classification, handle boundary cases with a two-stage evaluation: "does it invalidate?" + "can it be localized?"
- For output generation constraints, "pre-inclusion in generation directives" provides stronger quality assurance than "post-verification via checklist." Post-verification detects violations but cannot prevent them
- Free-text pass_criteria and expected_result have two simultaneous failure modes when executed by AI agents: "partial fulfillment" and "arbitrary interpretation"

### Constraint Propagation and Relaxation

- **Constraint propagation**: When a constraint is defined at a higher level (e.g., a base class invariant), it must propagate to all lower levels (subclasses, implementations). If propagation is not enforced by the type system or framework, manual verification is required at each level
- **Constraint relaxation dangers**: Removing or weakening a constraint after it has been relied upon by downstream code is a form of contract violation. All callers that depended on the stronger constraint must be identified and verified. Real example: removing a `NOT NULL` constraint from a database column requires verifying that all application code handles null values
- **Schema validation layers**: JSON Schema, Zod (TypeScript), io-ts (TypeScript), Pydantic (Python) — these tools validate data at system boundaries. Validation must occur at the point where data enters the system, not where it is consumed. Real example: Stripe uses JSON Schema to validate webhook payloads before processing

### Database vs Application Constraint Boundary

- Database constraints (NOT NULL, UNIQUE, FOREIGN KEY, CHECK) are enforced regardless of which application accesses the data. They are the last line of defense
- Application constraints (business logic validation) can express rules that database constraints cannot (e.g., "end date must be after start date" combined with business calendar rules)
- The same constraint should not be enforced in only one layer. Critical constraints belong in both layers. If the database constraint is missing, a bug in one application can corrupt data for all applications. If the application constraint is missing, the user receives a raw database error instead of a meaningful message
- Real example: Stripe's idempotency keys — enforced at both the application level (tracking request state) and the database level (unique constraint on idempotency key column) to prevent duplicate charges

## Security Logic

### Authentication Logic

- **Token validation chain**: Each token must be validated for (1) structural integrity, (2) signature verification, (3) expiration, (4) issuer, and (5) audience. Skipping any step creates a vulnerability. Common mistake: verifying JWT signature but not checking `exp` claim
- **Session management**: Sessions must have absolute timeout and idle timeout. Invalidate on password change and explicit logout. Store tokens securely (HttpOnly, Secure, SameSite cookies)
- **OAuth 2.0 flow**: Authorization code flow must use PKCE for public clients (SPAs, mobile apps). Implicit flow is deprecated (exposes tokens in URL). Refresh tokens must be rotated on use

### Authorization Logic

- See concepts.md §Security for RBAC and ABAC definitions. Operational rules below:
- **RBAC limitation**: Cannot express context-dependent rules (e.g., "edit only own resources"). When context-dependent authorization is needed, ABAC or hybrid models are required
- **ABAC in practice**: AWS IAM policies combine effect (Allow/Deny), action, resource, and conditions. Explicit Deny always wins
- **Policy conflict resolution**: When multiple policies apply, the system must define a resolution strategy: deny-overrides (any deny wins), permit-overrides (any permit wins), or first-applicable. Changing the strategy changes the security posture

### Input Validation Logic

- **Sanitization vs validation distinction**: Validation rejects invalid input (returns an error). Sanitization modifies input to make it safe (removes or escapes dangerous characters). They serve different purposes and are not interchangeable. Validate first, then sanitize if the input must be transformed
- **Defense in depth**: Input validation at the API boundary does not eliminate the need for parameterized queries, output encoding, and CSP headers. Each layer defends against a different failure mode. If the validation layer has a bug, the inner layers still prevent exploitation
- **Injection prevention**: SQL injection is prevented by parameterized queries, not by input sanitization. XSS is prevented by output encoding (context-dependent: HTML, JavaScript, URL, CSS), not by input validation alone. Command injection is prevented by avoiding shell execution with user input, not by escaping

## Error Handling Logic

### Error Classification

- **Operational errors** (recoverable): network timeout, connection refused, validation failure, rate limit exceeded. The system is designed to handle these. Recovery strategies: retry, fallback, circuit break, queue for later
- **Programmer errors** (non-recoverable): null dereference, assertion violation, type error at runtime, index out of bounds. These indicate code defects. Strategy: fail fast, log with full context, do not retry

### Error Propagation Patterns

- **Result types (Rust, modern TS)**: Errors as values in the return type. Forces callers to handle both success and failure. No hidden control flow. Composable with map/flatMap
- **Exception hierarchy (Java, Python, C#)**: Errors as thrown objects. Checked exceptions (Java) force handling at compile time but erode with catch-all. Unchecked exceptions preserve ergonomics but errors pass silently
- **Error middleware (Express, Koa, ASP.NET)**: Centralized error handling in request pipeline. Transforms internal errors into user-facing responses. Must not swallow errors silently
- **Anti-pattern**: catch-and-ignore (`catch (e) {}`) creates silent failures. Every catch block must log, re-throw, or return an error value

### User-Facing Error Requirements

- User-facing errors must include: (1) what went wrong (human-readable), (2) what the user can do (recommended action), (3) correlation ID (for support/debugging)
- Raw stack traces, internal class names, and SQL errors must never reach end users. These expose implementation details and assist attackers
- Error messages must be locale-aware when i18n is applicable (see domain_scope.md §Internationalization/Accessibility)

### Cascading Failure Prevention

- A single downstream failure must not cascade to the entire system
- For circuit breaker, bulkhead, timeout, and retry patterns, see dependency_rules.md §Runtime Dependency Rules (SSOT for cascading failure prevention mechanisms)
- This section owns only the classification and propagation design; dependency_rules.md owns the runtime resilience mechanisms

### Error Logging and Observability

- Errors must be logged with sufficient context for diagnosis without reproduction: timestamp, request ID, user context, input that caused the error, stack trace (for programmer errors)
- Cross-reference: competency_qs.md CQ-E-01~CQ-E-08

## Concurrency Logic

### Deadlock Conditions

- **Coffman's four conditions**: Deadlock occurs if and only if all four conditions hold simultaneously: (1) mutual exclusion — resources are non-shareable, (2) hold and wait — processes hold resources while waiting for others, (3) no preemption — resources cannot be forcibly released, (4) circular wait — a cycle exists in the resource-wait graph. Preventing any one condition prevents deadlock
- **Lock ordering**: If all threads acquire locks in the same global order, circular wait is impossible. This is the most practical deadlock prevention strategy. Real example: database systems use lock ordering internally; application code must impose ordering manually when acquiring multiple locks

### Race Condition Patterns

- **Check-then-act**: Reading a value and then acting on it without atomicity. Example: checking if a file exists, then creating it — another thread may create the file between the check and the act. Solution: use atomic operations (e.g., `O_CREAT | O_EXCL` for file creation, `INSERT ... ON CONFLICT` for databases)
- **Read-modify-write**: Reading a value, modifying it, and writing it back without atomicity. Example: incrementing a counter. Solution: use atomic increment operations or compare-and-swap (CAS)
- **Time-of-check to time-of-use (TOCTOU)**: A variant of check-then-act where the resource state changes between verification and use. Particularly dangerous in security contexts (e.g., checking file permissions, then opening the file)

### Concurrency Model Rules

- **Go goroutines**: "Share memory by communicating." Use channels for inter-goroutine communication. A sent value should be considered transferred — the sender must not modify it after sending
- **Node.js event loop**: Single-threaded for user code. Long-running synchronous operations block the event loop, stalling all other requests. CPU-intensive work must be offloaded to worker threads
- **Actor model (Erlang, Akka)**: Each actor processes messages sequentially from its mailbox. No shared state between actors. Message ordering guaranteed between a specific sender-receiver pair but not across senders

## Testing Logic

### Test Independence

- Tests must not depend on execution order. If test B fails only when run after test A, there is shared mutable state (database, global variable, file system) that test A modifies. Each test must set up its own preconditions and clean up after itself
- Tests must not depend on external services unless explicitly marked as integration tests. Unit tests with network calls are flaky by definition. Real example: Google's test classification — small (no I/O), medium (localhost only), large (external systems allowed)

### Test Determinism

- A flaky test (sometimes passes, sometimes fails with no code change) is worse than no test — it erodes trust in the test suite. Common causes: time-dependent logic, uncontrolled concurrency, external service variability, test order dependency
- Time-dependent tests must use injectable clocks, not `Date.now()` or `System.currentTimeMillis()`. Tests that depend on "current time" will fail when run at different times or in different time zones
- Random data in tests must use seeded random generators for reproducibility. If a test fails with seed S, it must fail again with seed S

### Test Boundary Rules

- **Unit test boundary**: Tests a single function or class in isolation. External dependencies (databases, APIs, file system) are replaced with test doubles (mocks, stubs, fakes). Fast (milliseconds). Run on every commit
- **Integration test boundary**: Tests the interaction between two or more components, including real external dependencies. Slower (seconds to minutes). Run on every PR or on a schedule
- **The boundary decision**: If the function under test calls a database, the test is an integration test unless the database call is replaced by a test double. Mislabeling integration tests as unit tests causes slow test suites and flaky CI

### Mutation Testing

- Mutation testing modifies the production code (e.g., changes `>` to `>=`, removes a method call) and verifies that at least one test fails. If no test fails (the mutant "survives"), the test suite has a gap — code that can be changed without any test detecting the change
- Mutation testing is computationally expensive. Apply it selectively to critical business logic, not the entire codebase
- A surviving mutant in a trivial location (e.g., log message formatting) may not warrant a new test. Prioritize mutants in business logic and security-sensitive code

## Performance Logic

### Caching Rules

- **Cache invalidation strategies**: TTL-based (time-to-live: simplest, eventual consistency), event-based (publish invalidation on write: stronger consistency, more complex), versioned keys (append version to cache key: no invalidation needed, key space grows)
- Cache must declare its source of truth and staleness tolerance. Cross-reference: dependency_rules.md §Source of Truth Management
- **Cache stampede prevention**: When a popular cache key expires, hundreds of requests simultaneously compute the value. Strategies: probabilistic early expiration, mutex/lock on recomputation, background refresh before TTL

### N+1 Query Detection

- **Pattern**: Loading a list of N items, then issuing 1 query per item to fetch related data. Total: N+1 queries instead of 2 (one list + one batch)
- **Detection**: ORM query logging, database query count assertions in tests, static analysis tools (bullet gem for Rails, dataloader for GraphQL)
- **Resolution**: Eager loading (JOIN), batch loading (WHERE id IN (...)), DataLoader pattern (batch + deduplicate within request)

### Index Strategy

- Every query in a production hot path must have a supporting index. Unindexed queries on tables >10K rows cause full table scans
- Composite indexes: column order matters (leftmost prefix rule). Index on (A, B, C) supports queries on A, (A, B), and (A, B, C) but not B alone or (B, C)
- Index maintenance cost: every write operation updates all indexes. Over-indexing slows writes. Balance read performance against write overhead

### Load Testing Criteria

- For quantitative load testing thresholds (P99 > 1s triggers review), see structure_spec.md §Quantitative Thresholds (SSOT for performance thresholds)
- For SLI/SLO definitions, see domain_scope.md §Operations, Deployment & Maintenance (SSOT for service level targets)
- This section owns only the caching, query optimization, and indexing rules; structure_spec.md owns the thresholds and domain_scope.md owns the SLO framework

## Dependency Logic

See dependency_rules.md for all dependency-related rules.

## Constraint Conflict Detection

- If two rules constrain the same target in opposite directions, it is a conflict
- Required and optional are independent axes
- Verification rules must be independent of execution order
- "Referential integrity" and "semantic consistency" are separate verification layers. Passing referential integrity does not guarantee semantic consistency

## Inter-module Contract Logic

- Changes to a public API affect all consumers. Cross-reference: dependency_rules.md 'API Dependency Management'
- Changes to internal implementation should not affect consumers as long as the public API is maintained
- Depending on behavior not specified in the contract is implicit coupling and is risky
- In batch processing, placing transaction boundaries at the Phase level and performing consistency verification at each Phase completion is a practical pattern
- For backward compatibility classification (breaking vs non-breaking changes), see dependency_rules.md §Breaking vs Non-breaking Changes Classification

## Related Documents
- concepts.md — term definitions for type system, constraint design, concurrency, security, and testing
- dependency_rules.md — dependency direction rules, API dependency management, build/package dependency rules
- structure_spec.md — module structure, layer structure principles, verification structure
- competency_qs.md — CQ-T-01~CQ-T-08 (Types and Constraints verification questions)
- competency_qs.md — CQ-E-01~CQ-E-08 (Error Handling verification questions)
- competency_qs.md — CQ-P-01~CQ-P-04 (Performance verification questions)
