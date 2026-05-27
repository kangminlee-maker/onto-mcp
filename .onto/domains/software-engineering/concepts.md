---
version: 8
last_updated: "2026-05-28"
source: bundled-domain-baseline
status: established
---

# Software Engineering Domain — Concept Dictionary and Interpretation Rules

Classification axis: **topic** — classified by the engineering topic each term belongs to. Each term is tagged with its abstraction layer: [L1] Language/Runtime, [L2] Design Pattern/Principle, [L3] Domain/Practice.

## Abstraction Layer Reference

Software engineering terms operate at three abstraction layers. Each term in the topic sections below is tagged with its layer.

- **[L1] Language/Runtime Fundamentals**: Primitives defined by language specifications and runtime environments. Exist regardless of design methodology
- **[L2] Design Pattern/Principle**: Proven solutions to recurring design problems. Exist as conventions, not language features
- **[L3] Domain/Practice**: Terms belonging to specific engineering practices and sub-disciplines

Layer 1 defines what the language/runtime provides. Layer 2 encodes design wisdom on top of Layer 1 primitives. Layer 3 applies both to specific engineering disciplines. A design pattern (L2) may be unnecessary when a language feature (L1) already solves the problem.

## Architecture Core Terms

- [L2] SRP (Single Responsibility) = a module should have one reason to change. "Reason to change" means one stakeholder or business concern — not "does one thing"
- [L2] OCP (Open/Closed) = open for extension, closed for modification. New behavior via new implementations, not editing existing code
- [L2] LSP (Liskov Substitution) = subtypes must be substitutable for their base types without altering correctness. Classic violation: `Square extends Rectangle` breaking independent width/height
- [L2] ISP (Interface Segregation) = clients should not depend on methods they do not use. Prefer multiple small interfaces over one large interface
- [L2] DIP (Dependency Inversion) = high-level modules depend on abstractions, not low-level modules. The architectural basis for testability and modularity
- [L2] DRY (Don't Repeat Yourself) = every piece of knowledge has a single representation. Targets knowledge duplication, not code duplication — identical code with different change-reasons should remain separate
- [L2] KISS = prefer the simplest solution that meets requirements
- [L2] YAGNI = do not implement functionality until actually needed
- [L2] Factory = encapsulates object creation logic. Factory Method (subclass decides) vs Abstract Factory (family of related objects)
- [L2] Strategy = encapsulates interchangeable algorithms behind a common interface, selected at runtime
- [L2] Observer = subject notifies dependents of state changes. Foundation for event-driven architectures. Risk: memory leaks from unregistered observers
- [L2] Repository = collection-like interface for accessing domain objects, hiding persistence details from business logic
- [L2] Unit of Work = tracks changes during a business transaction and writes them as a single atomic operation. Often paired with Repository
- [L2] CQRS (Command Query Responsibility Segregation) = separating read and write into distinct models. Justified when read/write patterns differ significantly; adds complexity otherwise
- [L2] Saga = distributed transactions as a sequence of local transactions with compensating actions. Choreography-based (events) or orchestration-based (coordinator)
- [L2] Hexagonal (Ports and Adapters) = application logic at center, surrounded by ports (interfaces) and adapters (implementations). Domain independent of infrastructure
- [L2] Clean Architecture = concentric layers where dependencies point inward. The Dependency Rule: source code dependencies point toward higher-level policies
- [L2] Layered Architecture = separation by technical layers such as Presentation, Business/Application, and Data Access. This is distinct from Vertical Slice Architecture, which organizes by feature. Layer direction rules depend on the declared architecture pattern and dependency kind
- [L2] Microservices = independently deployable services communicating via network. Benefits: independent scaling/deployment. Costs: distributed system complexity
- [L2] Monolith = single deployable unit. Not inherently bad — simpler deployment, no network latency, easier debugging
- [L2] Modular Monolith = monolith with enforced module boundaries. Monolith simplicity with microservice-like modularity
- [L1] Module (language/runtime) = a unit recognized by the language's package/module system — ECMAScript module, Java module (JEP 261), Go package, Python module. Defines visibility and resolution scope at compile/load time
- [L3] Module (architectural) = an independently deployable or replaceable unit of code with a defined public interface. Used in module-separation, modular-monolith, and module-boundary discussions. Often implemented as one or more L1 modules but the boundary is a design decision, not a language one
- [L2] Dependency = a relationship where one module requires another's functionality. Circular dependencies indicate a design flaw
- [L2] Bounded Context (DDD) = the scope within which a specific domain model is consistently applied. Coined by Eric Evans. "Customer" in billing has payment methods; "Customer" in shipping has addresses. Same word, different models
- [L2] Anti-corruption Layer = a translation layer between bounded contexts that prevents one model from corrupting another
- [L2] Source of Truth = the authoritative data/definition source when inconsistencies arise. Without declared priority, data divergence becomes undetectable
- [L2] Adapter = translates between an external interface and the application's internal interface
- [L2] Port = an interface defining how the application interacts with outside systems. Driving (used by external actors) vs driven (used by the application)
- [L2] Gateway = unified interface to a complex subsystem or external system
- [L2] Middleware = component in the request pipeline executing before/after the main handler. Uses: auth, logging, error handling
- [L2] Sidecar = co-deployed auxiliary process adding functionality without modifying the service. Common in service mesh architectures

## Data/State Management Terms

- [L2] State = current point-in-time system information. Stateful: maintains state between requests. Stateless: derives from each request
- [L2] Mutation = an operation that modifies state. Functional programming avoids mutation; imperative programming controls it
- [L2] Transaction = atomic operation that succeeds entirely or fails entirely (ACID)
- [L2] Migration = applying schema changes to existing data. Must be reversible and idempotent
- [L2] Terminal State = a final state with no further transitions. In Event Sourcing: transition event, Projector branch, and allowed subsequent events must all be defined
- [L2] Optimistic Locking = reads with version number, checks at write time. Fails on version mismatch. For low-contention scenarios
- [L2] Pessimistic Locking = acquires lock before reading. For high-contention scenarios. Risk: deadlocks
- [L2] Eventual Consistency = replicas converge to the same value given time. Does not mean "inconsistent" — guarantees convergence
- [L2] Strong Consistency = every read returns the most recent write. Cost: higher latency, reduced availability during partitions
- [L2] CAP Theorem = distributed systems can guarantee at most two of: Consistency, Availability, Partition tolerance. Since partitions are unavoidable, the practical choice is CP or AP
- [L2] Snapshot = point-in-time state copy. In Event Sourcing, avoids replaying all events from the beginning
- [L2] Replay = reconstructing state by re-applying events from the log. Core mechanism of Event Sourcing

## Type System Terms

- [L1] Type = a classification of data that determines valid operations. The foundation of compile-time and runtime correctness checks
- [L1] Interface = a type-level contract specifying method signatures without implementation. Enables polymorphism
- [L1] Generic (Parametric Polymorphism) = a type parameter allowing code to operate on multiple types while preserving type safety. `List<T>` is generic; `List<string>` is a concrete instantiation
- [L1] Enum = a type with a fixed, closed set of named values. Enables exhaustive checking at compile time
- [L1] Union Type = a type that can be one of several specified types. `string | number` accepts either
- [L1] Intersection Type = a type that must satisfy all specified types simultaneously. `A & B` has all members of both A and B
- [L1] Closure = a function that captures variables from its enclosing scope. The captured variables persist beyond the enclosing function's return
- [L1] Value Type vs Reference Type = value types are copied on assignment; reference types share the same underlying object. Misunderstanding this causes aliasing bugs
- [L2] Discriminated Union = types distinguished by a shared field (discriminant). Enables type-safe branching per variant
- [L2] Exhaustive Check = verification that all cases are handled. `default: never` pattern focuses errors at origin when variants are added
- [L2] Contract = module agreement specifying both guarantees and non-guarantees. Omitting non-guarantees creates hidden coupling
- [L2] Structural vs Nominal Typing = structural (TypeScript, Go): compatible if structure matches. Nominal (Java, C#): requires explicit declaration. Structural enables duck typing; nominal prevents accidental compatibility
- [L2] Type Guard = runtime check that narrows a type within a scope. Custom guards use `is` syntax
- [L2] Type Narrowing = compiler reducing a broad type to specific type based on control flow analysis
- [L2] Branded Type (Opaque Type) = structurally identical but treated as distinct. `type UserId = string & { __brand: 'UserId' }` prevents passing raw strings where UserId is expected
- [L2] Variance = how generic subtyping relates to parameter subtyping. Covariant (safe for reading), Contravariant (safe for consuming), Invariant (safe for both)

## Constraint Design Terms

- [L2] Hard Constraint = invalidates the system when violated. Enforced by code. Example: "order total must be non-negative"
- [L2] Soft Constraint = degrades quality when violated but system continues. Enforced through protocol. Example: "response under 200ms"
- [L2] Invariant = condition always true, detectable by structure alone. Enforced by code
- [L2] Best-effort = requires semantic interpretation, structural detection impossible. Recommended through protocol
- [L2] Precondition = must be true before an operation executes. Caller's responsibility
- [L2] Postcondition = guaranteed true after successful operation completion. Implementer's responsibility

## Change Management Terms

- [L2] Breaking Change = breaks existing consumers' code or data. Removing a public method, changing a return type, tightening a constraint
- [L2] Backward Compatible = existing consumers work without modification. Adding optional parameters, loosening constraints
- [L2] Deprecation = maintaining while announcing future removal. Must specify: what, when removed, and replacement
- [L2] Semantic Versioning (SemVer) = MAJOR.MINOR.PATCH. MAJOR: breaking. MINOR: backward-compatible features. PATCH: bug fixes. A communication contract — violating it erodes consumer trust
- [L2] Feature Toggle = enable/disable features at runtime without deployment. Risk: toggle debt from unremoved toggles
- [L2] Technical Debt = a deliberate shortcut with known future cost, owner, and remediation expectation. It differs from accidental complexity or a defect because the tradeoff is acknowledged and tracked
- [L2] Trunk-based Development = all developers commit to main with short-lived branches. Requires strong CI and feature toggles
- [L2] Branch-by-Abstraction = large changes without long-lived branches: introduce abstraction, implement new version behind it, switch, remove old

## Quality Terms

- [L2] Idempotent = same result regardless of repetition count. `DELETE /user/123` is idempotent; `POST /orders` is not. Critical for retry-safe APIs
- [L1] Pure Function = no external state dependency, no side effects. Same input → same output. Testable, cacheable, parallelizable
- [L1] Deterministic = same output for same input. All pure functions are deterministic, but not all deterministic functions are pure
- [L1] Referential Transparency = an expression replaceable with its value without changing behavior. Enables equational reasoning
- [L2] Memoization = caching function results for repeated inputs. Only safe for pure/deterministic functions
- [L2] Immutability = data cannot be modified after creation. Shallow: top-level immutable, nested mutable. Deep: immutable at all depths
- [L2] Thread Safety = correct behavior under concurrent access. Strategies: immutability, synchronization, lock-free (CAS). Lock-free guarantees system-wide progress; wait-free guarantees per-thread progress

## Concurrency Primitives

- [L1] Thread = an OS-scheduled execution unit sharing memory with other threads in the same process. Requires synchronization (locks, atomics) to prevent data races
- [L1] Process = an OS-scheduled execution unit with its own memory space. Isolation prevents data races but requires IPC for coordination
- [L1] Coroutine = a function that can suspend and resume execution. The foundation for async/await. Cooperative (voluntarily yields) vs preemptive (OS interrupts)
- [L1] Event Loop = a runtime construct that processes a queue of events/callbacks sequentially. The concurrency model for Node.js, browser JavaScript, and Python asyncio

## Memory Management

- [L1] Garbage Collection (GC) = automatic memory reclamation of unreferenced objects. Strategies: mark-and-sweep, generational, reference counting. Trade-off: convenience vs pause-time unpredictability
- [L1] Stack = memory region for function call frames, LIFO allocation. Fixed size per thread
- [L1] Heap = memory region for dynamically allocated objects with arbitrary lifetimes. Managed manually (C/C++) or by GC

## Security Terms

- [L3] CSRF (Cross-Site Request Forgery) = malicious site triggers requests using victim's session. Prevented by CSRF tokens or SameSite cookies
- [L3] XSS (Cross-Site Scripting) = malicious scripts injected into pages. Types: stored, reflected, DOM-based. Prevented by output encoding and CSP
- [L3] SQL Injection = malicious SQL via unsanitized input. Prevented by parameterized queries, never string concatenation
- [L3] CORS (Cross-Origin Resource Sharing) = HTTP mechanism allowing cross-origin access. Not a security feature — it relaxes the same-origin policy
- [L3] CSP (Content Security Policy) = HTTP header specifying allowed content sources. Primary defense against XSS
- [L3] RBAC (Role-Based Access Control) = permissions assigned to roles, users assigned to roles. Simple but coarse-grained
- [L3] ABAC (Attribute-Based Access Control) = access decisions based on user/resource/environment attributes. More flexible than RBAC, harder to audit
- [L3] Data Classification = labeling data by sensitivity, regulatory exposure, tenant/user boundary, and handling obligations
- [L3] Retention Policy = rule defining how long data or artifacts are kept, why they are kept, and when they must be deleted or archived
- [L3] Deletion/Erasure Path = implemented path that removes or anonymizes data across primary stores, derived stores, indexes, caches, logs, backups, and downstream processors according to the retention/privacy obligation
- [L3] Data Minimization = collecting, storing, and exposing only the data needed for the declared purpose

## Testing Terms

- [L3] Unit Test = tests a single unit in isolation. Fast, deterministic. If it needs a database, it is not a unit test
- [L3] Integration Test = tests interactions between components (DB, API, queues). Catches interface mismatches unit tests cannot
- [L3] E2E Test = tests full application path. Slowest, most brittle, highest confidence
- [L3] Contract Test = verifies API conformance to a shared contract. Consumer-driven: consumer defines expectations, provider verifies
- [L3] Property-Based Test = generates random inputs to verify properties hold universally. Finds edge cases example-based tests miss
- [L3] Mutation Test = modifies source code and checks if tests detect it. Surviving mutants = untested behavior
- [L3] Test Double = objects replacing real dependencies. Mock (verifies interactions), Stub (canned responses), Fake (simplified implementation), Spy (records calls)

## Observability Terms

- [L3] Logging = recording discrete events with timestamps and structured data. Structured (JSON) for machines; unstructured for humans
- [L3] Metrics = numerical measurements over time. Counters (monotonic), gauges (point-in-time), histograms (distributions)
- [L3] Tracing = tracking a request across service boundaries via trace ID. Each service adds a span
- [L3] SLI (Service Level Indicator) = quantitative measure of service behavior
- [L3] SLO (Service Level Objective) = target value for an SLI. Internal engineering target
- [L3] SLA (Service Level Agreement) = contract with consequences if SLOs are not met. Always backed by stricter internal SLOs

## DevOps Terms

- [L3] CI/CD = CI: build and test on every commit. CD: automatically deploy verified builds. The pipeline is the automated sequence of these stages
- [L3] Build Artifact = versioned, immutable build output (JAR, Docker image, npm package). Never modified — only replaced
- [L3] SBOM = Software Bill of Materials. Machine-readable inventory of components and dependency versions included in a build or release
- [L3] Artifact Attestation = signed or otherwise verifiable statement about how a build/release artifact was produced, by whom/what, from which inputs, and with which verification results
- [L3] Release Artifact Traceability = ability to trace a deployed artifact back to source revision, build pipeline, dependency set, verification results, approval gate, and deployment environment
- [L3] Blue-Green Deployment = two identical environments, switch traffic between them. Instant rollback. Cost: double infrastructure
- [L3] Canary Deployment = route small traffic percentage to new version, increase gradually if healthy
- [L3] Rolling Deployment = replace instances one at a time. Both versions coexist during rollout

## LLM-Native Engineering Terms

Domain-local definitions in this section own software-engineering usage. Onto/productization core concepts are marked as **domain projections**: the canonical seat remains in `.onto/authority/`, `.onto/principles/`, or `.onto/processes/`, while this file records how the software-engineering domain uses the concept during review.

- [L3] LLM-Native Development = software development where LLMs, agents, prompt/context contracts, retrieval, model providers, semantic evaluation, or AI-assisted workflows materially affect product behavior or engineering workflow. It is now a sub-area of software engineering, not a separate review domain
- [L3] Behavior-Affecting Artifact = any artifact whose change can alter software behavior, engineering workflow, review outcome, trust status, or release decision. Includes code, config, schemas, prompts, context assembly rules, tool schemas, retrieval policies, eval rubrics, model routes, and generated authority artifacts
- [L3] Model Provider = an external or local system that serves model inference. Provider identity, API contract, auth mode, rate limits, pricing, and model version are runtime dependencies
- [L3] Model Version = a specific model release used for inference. Version aliases such as `latest` reduce reproducibility; pinned versions make behavior changes diagnosable
- [L3] Model Route = the runtime decision that selects a model/provider/profile for a task. A model route must expose the selected provider/model facts, capability requirements, fallback policy, and diagnostic behavior
- [L3] Prompt Template = a versioned instruction artifact with placeholders filled at runtime. A prompt template change is a behavior change, comparable to code or configuration changes
- [L3] Context Assembly = the runtime or agent process that selects and orders the information sent to the model. Context assembly owns token budget, provenance, relevance, and omission behavior
- [L3] LLM Boundary (domain projection) = software-engineering use of the LLM/runtime interface principles in `.onto/principles/llm-runtime-interface-principles.md` and `.onto/principles/llm-native-development-guideline.md`. In this domain, reviews ask which semantic interpretation or judgment is delegated to the LLM and which runtime-owned gates must receive its output
- [L3] Runtime Boundary (domain projection) = software-engineering use of runtime-owned deterministic authority: binding, validation, state transition, persistence, audit, cost/security gates, idempotency, and authority artifact assembly. The canonical boundary principles live in `.onto/principles/llm-runtime-interface-principles.md`
- [L3] Middleware Boundary (domain projection) = software-engineering use of middleware-owned transport/adaptation responsibilities: envelope conversion, routing plumbing, auth/context propagation, retry envelopes, and observability plumbing. Middleware must remain a bounded adapter, not a second semantic or policy authority
- [L3] Ownership Non-Interference (domain projection) = software-engineering review rule derived from the LLM/runtime interface principles: boundary crossings must declare owner, input/output, enforcement profile, artifact or trust status, and diagnostic behavior
- [L3] Retrieved Context = external material selected for model input by search, RAG, graph traversal, or direct file selection. It must carry provenance when used as evidence
- [L3] Prompt Injection Boundary = the boundary that treats external content, user text, retrieved text, tool output, and webpages as data rather than instruction authority. Prompt instructions are not a security boundary
- [L3] RAG Permission Boundary = the requirement that retrieval preserve access control, tenancy, source validation, poisoning checks, provenance, and auditability before content influences model context
- [L3] Embedding Index Compatibility = the rule that vectors produced by different embedding models, dimensions, preprocessing, or chunking policies are not interchangeable without a declared migration or dual-index strategy
- [L3] Output Zero-Trust = the rule that LLM output is untrusted until runtime validates it for shape, policy, authorization, provenance, and the specific downstream sink
- [L3] Sink Validation = validation/encoding/authorization performed for the concrete place where output will be used: shell, SQL, HTML, file path, email, API call, artifact write, or user-facing decision
- [L3] LLM Agent = an LLM-powered system that observes state, chooses actions, invokes tools, and updates progress toward a goal. It differs from a simple prompt-response call by having an action loop
- [L3] Agent Functionality = what an agent is technically able to do through tools and runtime capabilities
- [L3] Agent Permission = what an agent is authorized to do for the current user, tenant, scope, and operation
- [L3] Agent Autonomy = what an agent may do without human approval. Functionality, permission, and autonomy are separate axes
- [L3] Tool Schema = the machine-readable contract that tells an agent how to call a tool. It must include name, description, parameter schema, required fields, and result semantics sufficient for agent selection
- [L3] MCP Tool Boundary = the protocol boundary where an MCP server exposes tools/resources/prompts and a host or agent invokes them. The model requests a tool call; runtime code executes and validates it
- [L3] Semantic Evaluation = evaluation of usefulness, faithfulness, specificity, actionability, calibration, or other qualities that cannot be proven by deterministic tests alone
- [L3] Evaluation Baseline = a recorded set of expected examples, rubrics, scores, or comparative outputs used to detect semantic regression and production drift
- [L3] Production Drift = behavior or quality movement after release caused by data changes, provider/model changes, prompt/context changes, corpus changes, traffic shifts, or external environment changes
- [L3] Fail-Loud = a diagnostic posture where contract failures stop or surface with explicit failure location, cause, and artifact refs. In LLM-native development, fail-loud reduces exploration cost by making the failing prompt/context/model/tool/schema boundary visible
- [L3] Fail-Close = a gate posture where contract-missing or unsafe output is blocked from becoming trusted output. Fail-close is a safety gate; fail-loud is the diagnostic visibility expected when the gate closes
- [L3] Silent Degradation = a fallback, repair, default, or graceful-degradation path that hides the original failure or omits visible loss markers. Silent degradation is usually more costly in LLM-native development because it forces later investigators to rediscover the hidden failure
- [L3] Graceful Degradation = an intentional product behavior that serves a reduced result when full behavior is unavailable. It is acceptable only when the loss is explicit, logged, and compatible with the user's task
- [L3] Artifact Truth (domain projection) = software-engineering use of the productization principle that durable artifacts, not transient responses, own process truth. Canonical review artifact seats are defined by `.onto/principles/productization-charter.md` and `.onto/processes/review/record-contract.md`
- [L3] Provenance = the recorded source, builder/agent, input set, transformation path, verification state, and time/version facts needed to explain why a software artifact, generated artifact, release artifact, or claim should be trusted
- [L3] Generated Artifact = an artifact authored or transformed by an LLM, agent, generator, build step, or automation. It needs provenance when it affects authority, release, security, or user decisions
- [L3] AI Supply Chain = the dependency chain for AI behavior: model/provider, dataset/corpus, embedding model/index, prompt framework, tool runtime, eval judge, safety layer, and generated artifacts
- [L3] AI Governance = accountable management of AI behavior through owner assignment, risk treatment, approval gates, transparency, audit evidence, incident response, and continuous improvement
- [L3] AI Risk Owner = the accountable role or team that accepts, mitigates, transfers, or rejects material risk introduced by AI behavior
- [L3] Human Approval Gate = a runtime or process gate requiring human authorization before high-impact AI output, tool execution, release, or user-visible action becomes authoritative
- [L3] Red-Team/Eval Loop = the feedback loop that turns adversarial findings, incidents, semantic eval results, and production drift into updated prompts, policies, tests, controls, and release gates
- [L3] AI Incident Disclosure = the operator/user/internal communication path used when AI behavior materially fails, exposes data, misleads users, causes unsafe action, or breaks a trust claim
- [L3] Context-Isolated Reasoning Unit (domain projection) = software-engineering use of the review/lens execution property defined in `.onto/processes/review/lens-prompt-contract.md`: the reasoning unit receives contracted input, does not share main-context state, and returns contracted output when independent judgment or disagreement preservation matters

## Document Design Terms

- [L3] Contract Document = specification with 1:1 code correspondence. Violation is a defect
- [L3] Guide Document = describes intent and context. Supplementary judgment material
- [L3] Self-contained Spec = includes all execution-necessary information. Required when AI agents are executors
- [L3] API-first Design = design the API contract before implementing server or client. Enables parallel development
- [L3] Schema-driven Development = deriving code from a single schema definition. Schema is source of truth
- [L3] OpenAPI = specification format for REST APIs (endpoints, schemas, auth, errors). De facto REST API standard
- [L3] AsyncAPI = specification for event-driven APIs (WebSocket, Kafka, AMQP). Analogous to OpenAPI for async

## Internationalization/Accessibility Terms

- [L3] Internationalization (i18n) = designing software so it can be adapted to different languages and regions without code changes. The number 18 represents the count of letters between 'i' and 'n'
- [L3] Localization (l10n) = adapting internationalized software for a specific locale: translations, date/number/currency formats, text direction (RTL/LTR)
- [L3] Locale = combination of language, region, and cultural conventions (e.g., en-US, ko-KR, ja-JP). Determines formatting rules for dates, numbers, currencies, and sort order
- [L3] Unicode = character encoding standard covering all writing systems. UTF-8 is the dominant encoding (>98% of web pages). UTF-16 used internally by Java, JavaScript, Windows
- [L3] ICU (International Components for Unicode) = library for locale-aware operations: formatting, collation, transliteration, break iteration
- [L3] WCAG (Web Content Accessibility Guidelines) = W3C standard defining accessibility requirements. Levels: A (minimum), AA (standard for most sites, legally required in many jurisdictions), AAA (enhanced)
- [L3] ARIA (Accessible Rich Internet Applications) = WAI-ARIA attributes that make dynamic web content accessible to assistive technologies. Supplements semantic HTML when native elements are insufficient
- [L3] Screen Reader = assistive technology that reads screen content aloud. Semantic HTML and ARIA labels are essential for screen reader compatibility
- [L3] Accessibility Tree = browser's parallel DOM representing the page for assistive technologies. Built from HTML semantics + ARIA attributes

## Homonyms Requiring Attention

- "service": service class (business logic) != microservice (deployment unit) != domain service (DDD, stateless operation) != OS service (daemon)
- "domain": review/domain-document namespace != business or problem domain != DDD bounded-context domain != Clean Architecture domain/entities layer != ontology property domain
- "artifact": build artifact (deployable/package output) != authority artifact (truth-bearing record/contract) != generated artifact (authored/transformed by automation) != provenance record (trust evidence) != documentation artifact
- "model": domain model (business object) != ML/LLM model != MVC model != data model (DB schema)
- "model version": package/library version != LLM model version != database schema version
- "agent": LLM agent != software agent (generic autonomous program) != user agent (browser HTTP header)
- "tool": MCP tool (agent-invocable function) != development tool (IDE/linter) != CLI tool
- "prompt": system prompt != user prompt != prompt template != MCP prompt primitive
- "token": authentication token / API key != LLM token (subword unit)
- "controller": MVC controller != hardware controller != Kubernetes controller (reconciliation loop)
- "context": execution context (runtime) != Bounded Context (DDD) != React Context != context window (LLM)
- "memory": process memory (RAM) != agent memory != persistence store != conversation history
- "alignment": model behavior alignment != UI text alignment != ontology alignment
- "migration": DB migration (schema change) != system migration (infrastructure move) != data migration (format transform)
- "validation": input validation (user data) != schema validation (data vs schema) != sink validation (safe use at a downstream sink) != design validation (architecture review) != semantic evaluation (quality judgment)
- "constraint": data constraint (DB) != design constraint (architecture) != business rule != type constraint (generic bounds)
- "event": domain event (business) != browser event (click) != system event (OS signal) != CloudEvents (format)
- "client": HTTP client != client application (frontend) != client (customer) != OAuth client (registered app)
- "middleware": Express middleware (handler chain) != message middleware (broker) != Redux middleware (interceptor)
- "hook": React hook != git hook != webhook (HTTP callback) != lifecycle hook (framework callback)
- "registry": npm registry != Docker registry != service registry (discovery)
- "module": ES module (import/export unit) != Node.js module (CommonJS require) != Python module (single .py file) != Java module (JPMS, since Java 9) != Go module (versioned dependency unit) != architectural module (deployable unit with public interface, see §Architecture Core Terms)

## Interpretation Principles

- Whether current behavior is intentional or a bug cannot be determined from code alone. Cross-check with tests, documentation, and commit history

- "Tests pass" and "works correctly" are not the same. Tests verify what they cover; they say nothing about untested paths. 100% code coverage does not mean 100% behavior coverage

- "Code coverage" and "test quality" are independent axes. High coverage with weak assertions provides false confidence. Low coverage with strong property-based tests may catch more real bugs

- "Working software" and "correct software" are not the same. "Working" is an empirical observation; "correct" is a logical property

- Inter-module contracts must specify both "what is guaranteed" and "what is not guaranteed." Unguaranteed behavior creates hidden coupling

- When a design principle is agreed upon, first verify whether it is already achieved in another form. Literal vs substantive achievement — distinguishing them prevents over-engineering

- "Referential integrity" (does A point to B?) and "semantic consistency" (are A's contents compatible with B's contents?) are separate verification layers

- "Distributed" and "scalable" are independent properties. Distribution is an execution profile decision; scalability is a capacity property

- "Eventual consistency" does not mean "inconsistent." It guarantees convergence. The term describes convergence behavior, not data quality

- "Microservices" is not a synonym for "good architecture." They solve organizational scaling at the cost of distributed complexity. A monolith that meets requirements is preferable

- "Technical debt" is not "code I don't like." Debt is a deliberate trade-off with known future cost. Accidental complexity or poor design are defects, not debt

- Naming collisions across abstraction layers cause persistent confusion. When a term appears in multiple contexts (see Homonyms), qualify it with the specific context on first use

## Related Documents
- domain_scope.md — definition of the areas where these terms are used
- logic_rules.md — rules related to type system and constraints
- structure_spec.md — rules related to module structure
- domain_scope.md §Internationalization/Accessibility — scope and applicability conditions
