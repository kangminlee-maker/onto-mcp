---
version: 8
last_updated: "2026-05-28"
source: zero-based-software-engineering-redesign
status: established
---

# Software Engineering Domain - Extension Cases

This document is the case-backed guideline library for the `software-engineering`
domain. It is consumed by review lenses through the existing review runtime, but it
does not define, add, or govern lenses.

A case is accepted only when it can support:

```text
case evidence -> principle -> guideline -> CQ seed -> PASS/FAIL criteria
```

The cases are intentionally not MECE. The same case may support multiple lenses.

## Card Format

Each case should answer these fields:

```text
Case ID:
Source evidence:
Evidence status (optional when source evidence names a dated/versioned anchor):
Observed failure:
Review concern relevance:
Principle:
Applicable when:
Guideline:
CQ seed:
PASS:
FAIL:
Related documents:
Supersedes (when applicable):
Superseded by (when applicable):
```

`Review concern relevance` names domain concerns, not lens governance proposals.
Security, operations, performance, verification, and similar labels are concern tags.
They must route through CQ seeds, related documents, or existing review paths; they do
not imply that a dedicated active lens exists or should be added.

## Case Evidence Currency

Case evidence must remain usable as standards and provider behavior change.

- Published standards or frameworks should name the version, year, profile, or stable local evidence ref used when available.
- Practice-pattern evidence with no single stable external version must be marked by descriptive source evidence and revisited when the corresponding CQ or case changes.
- Applicability windows are expressed through `Applicable when`; replacement rules are expressed through `Supersedes` and `Superseded by` when a case's source evidence or guideline is replaced.
- When an external anchor is superseded, the case should either update its source evidence or add a supersession note before changing the guideline.
- `last_updated` in this file is the current review date for the case library; a case with a different review date should add local `Last reviewed` metadata.

## Case ID Allocation and Lifecycle

- Case IDs are stable and must not be reused after deletion or retirement.
- `AI-*` is reserved for LLM-native, agentic, AI governance, AI supply-chain, prompt/context, retrieval, model/provider, and semantic-evaluation cases.
- `SE-*` is reserved for general software-engineering lifecycle, architecture, dependency, verification, operations, security, accessibility, and data cases.
- New namespaces require a reason, expected CQ family, and scenario-interconnection update.
- A superseded case keeps its ID and adds `Superseded by`; the replacement adds `Supersedes`.
- Scenario interconnections must reference stable case IDs, not titles alone.

## AI-Era Software Engineering Cases

### Case AI-01: Direct or Indirect Prompt Injection

- **Source evidence**: OWASP LLM Top 10 2025 LLM01 Prompt Injection; NIST AI 600-1 GenAI profile
- **Observed failure**: User text, webpage text, retrieved content, file content, or tool output contains instructions that override role, tool, output, disclosure, or authority rules
- **Review concern relevance**: logic, structure, dependency, security, pragmatics, axiology
- **Principle**: External content is data, not instruction authority. Prompt instructions are not a security boundary
- **Applicable when**: External content enters model context and the model can influence tool calls, artifacts, user-visible decisions, or sensitive output
- **Guideline**: Context assembly must preserve instruction hierarchy, label untrusted content, block exfiltration sinks, and test at least one hostile-content scenario when tool/authority impact exists
- **CQ seed**: Can external content change tool permission, role authority, output authority, or secret disclosure behavior?
- **PASS**: Runtime/context assembly treats external content as data, enforces instruction hierarchy, and records source/permission refs
- **FAIL**: The system relies on the model alone to ignore hostile content
- **Related documents**: concepts.md `Prompt Injection Boundary`; logic_rules.md `External Content and Prompt Injection Rules`; competency_qs.md CQ-A-16

### Case AI-02: Improper LLM Output Handling

- **Source evidence**: OWASP LLM Top 10 2025 LLM05 Improper Output Handling
- **Observed failure**: Schema-valid or plausible model output is passed into shell, SQL, HTML, file, email, API, or authority-artifact sinks without sink-specific validation
- **Review concern relevance**: logic, security, dependency, pragmatics
- **Principle**: LLM output is untrusted until validated for the concrete downstream sink
- **Applicable when**: Model output is consumed by code, tools, storage, UI, generated files, external messages, or authority artifacts
- **Guideline**: Require sink-specific validation/encoding/authorization in runtime gates; do not treat prompt format instructions as validation
- **CQ seed**: Is LLM output validated for every downstream sink before use?
- **PASS**: Each sink declares its validation/encoding/authorization gate and trust status
- **FAIL**: JSON validity or prompt compliance is used as proof of safety
- **Related documents**: concepts.md `Output Zero-Trust`; prompt_interface.md `Output Sink Constraints`; competency_qs.md CQ-A-15

### Case AI-03: Excessive Agency

- **Source evidence**: OWASP LLM Top 10 2025 LLM06 Excessive Agency
- **Observed failure**: An agent can use broad tools, privileged credentials, external communication, or irreversible writes because capability, permission, and autonomy were treated as one setting
- **Review concern relevance**: structure, logic, axiology, security
- **Principle**: Minimize agent functionality, permission, and autonomy separately
- **Applicable when**: An LLM can choose actions, invoke tools, update state, deploy, delete, message users, or touch sensitive data
- **Guideline**: Separate tool availability from authorization and from no-approval autonomy. Add human approval gates for high-impact actions
- **CQ seed**: Are capability, permission, and autonomy separately bounded?
- **PASS**: Tool registry, permission scope, approval gates, audit, and denial paths are explicit
- **FAIL**: "Use tools as needed" grants implicit permission or autonomy
- **Related documents**: concepts.md `Agent Functionality`, `Agent Permission`, `Agent Autonomy`; competency_qs.md CQ-A-18, CQ-G-05

### Case AI-04: Vector and Embedding Weakness

- **Source evidence**: OWASP LLM Top 10 2025 LLM08 Vector and Embedding Weaknesses
- **Observed failure**: Retrieval crosses tenant/user boundaries, retrieves poisoned material, loses source provenance, or mixes incompatible embedding indexes
- **Review concern relevance**: dependency, structure, security, coverage
- **Principle**: RAG is a dependency and permission boundary, not just a search feature
- **Applicable when**: External knowledge is chunked, embedded, indexed, retrieved, and injected into model context
- **Guideline**: Validate ingestion, preserve corpus lifecycle, filter permissions before context injection, record retrieval provenance, and treat embedding/index changes as migrations
- **CQ seed**: Can retrieved material influence claims without permission and provenance evidence?
- **PASS**: Source validation, permission filtering, poisoning checks, index compatibility, and retrieval audit exist
- **FAIL**: Retrieved text can cross boundaries or become evidence solely because it was relevant
- **Related documents**: concepts.md `RAG Permission Boundary`; logic_rules.md `Retrieval and Vector Rules`; competency_qs.md CQ-A-17

### Case AI-05: Model or Provider Behavior Change

- **Source evidence**: NIST AI RMF, NIST AI 600-1, provider deprecation/change patterns, dependency-management practice
- **Observed failure**: A model/provider route changes behavior, cost, latency, structured-output reliability, or safety characteristics while being treated as an implementation detail
- **Review concern relevance**: dependency, evolution, pragmatics
- **Principle**: Model/provider changes are behavior migrations
- **Applicable when**: A system uses hosted/local models, version aliases, route profiles, provider-specific auth, or model-specific tool/structured-output behavior
- **Guideline**: Record provider/model/version/alias status, compare old/new behavior with eval baselines, and list affected prompts, tools, indexes, dashboards, cost/rate assumptions, and release gates
- **CQ seed**: Can the system evaluate a model/provider migration without hidden behavior drift?
- **PASS**: Route facts, affected artifacts, semantic regression evidence, and rollout/rollback expectations are recorded
- **FAIL**: A provider or model is swapped with only package/API smoke success
- **Related documents**: dependency_rules.md `LLM/Agent Dependency Management`; competency_qs.md CQ-A-19

### Case AI-06: GenAI Governance Gap

- **Source evidence**: NIST AI RMF 1.0; NIST AI 600-1; ISO/IEC 42001
- **Observed failure**: AI behavior materially affects users or release decisions but has no accountable risk owner, approval gate, transparency path, or improvement loop
- **Review concern relevance**: axiology, coverage, pragmatics, evolution
- **Principle**: Governance is engineering material when AI behavior affects trust, harm, release, or authority
- **Applicable when**: AI output influences users, operators, security/privacy, production release, or durable artifacts
- **Guideline**: Name a risk owner, risk treatment, approval or acceptance gate, audit evidence, incident path, and review cadence
- **CQ seed**: Is there an accountable owner for material AI risk?
- **PASS**: Governance artifacts are connected to engineering release and incident loops
- **FAIL**: AI risk is treated as external policy with no engineering artifact or owner
- **Related documents**: domain_scope.md `Axiology Input`; competency_qs.md CQ-G-01

### Case AI-07: Generated Artifact Without Provenance

- **Source evidence**: SLSA provenance model; NIST SSDF; AI-generated-code and generated-document review patterns
- **Observed failure**: Generated code, docs, review records, eval outputs, or authority artifacts are accepted without source refs, builder/agent identity, input set, transformation path, or verification state
- **Review concern relevance**: dependency, logic, axiology, pragmatics
- **Principle**: Trustworthy artifacts need provenance and verification summaries
- **Applicable when**: A generated artifact affects release, user decisions, security posture, review records, or ontology authority
- **Guideline**: Persist provenance for generated artifacts and keep public responses as summaries of artifact truth, not competing authority
- **CQ seed**: Can generated authority-affecting artifacts be traced to source, builder, inputs, and verification state?
- **PASS**: Artifact provenance and trust status are durable and inspectable
- **FAIL**: The artifact is trusted because it appears plausible or was produced by a successful run
- **Related documents**: concepts.md `Provenance`, `Generated Artifact`; competency_qs.md CQ-G-02

### Case AI-08: Silent Degradation in Development or Review

- **Source evidence**: LLM-native development experience; failure-diagnosis cost patterns; NIST GenAI risk-management emphasis on transparency and monitoring
- **Observed failure**: A failing prompt, missing context, invalid tool result, provider preflight issue, schema mismatch, or missing artifact ref is hidden behind fallback output
- **Review concern relevance**: logic, pragmatics, axiology, conciseness
- **Principle**: In development/review/authority paths, fail-loud is usually cheaper and safer than silent degradation
- **Applicable when**: A path exists to repair the failing source quickly, or an artifact becomes authority
- **Guideline**: Halt or emit a diagnostic artifact naming the failing boundary. Allow user-facing degradation only with visible loss, trust status, diagnostics, and recovery path
- **CQ seed**: Is apparent continuity hiding trust loss or diagnostic loss?
- **PASS**: Failure location, cause, boundary, and artifact refs are visible
- **FAIL**: The system returns generic or partial output while hiding the original failure
- **Related documents**: logic_rules.md `LLM-Native Failure Posture`; competency_qs.md CQ-A-09, CQ-G-04

## General Software Engineering Cases

### Case SE-01: Feature Addition

- **Source evidence**: Slack Huddles-style product expansion; API/product evolution patterns
- **Observed failure**: New feature code ships without updating contracts, tests, docs, telemetry, permissions, or rollout/rollback paths
- **Review concern relevance**: coverage, structure, dependency, pragmatics
- **Principle**: A feature is a cross-artifact change, not only code
- **Applicable when**: A new capability affects users, APIs, data, permissions, observability, or documentation
- **Guideline**: Trace feature intent through API/schema, data model, tests, docs, telemetry, rollout, and ownership
- **CQ seed**: Do all externally observable feature surfaces have corresponding contract and verification updates?
- **PASS**: Code, API/schema, tests, docs, telemetry, rollout, and owner are aligned or marked non-applicable
- **FAIL**: Implementation exists but consumers, tests, or operations cannot see the change
- **Related documents**: structure_spec.md; competency_qs.md CQ-I, CQ-V, CQ-O

### Case SE-02: External Dependency Change

- **Source evidence**: React class-components-to-hooks ecosystem migration; package/API dependency practice
- **Observed failure**: A dependency upgrade changes lifecycle, compatibility, runtime assumptions, or ecosystem support without impact analysis
- **Review concern relevance**: dependency, evolution, structure
- **Principle**: Dependency changes carry behavior and migration obligations
- **Applicable when**: A package, framework, API, model provider, database, tool, or runtime changes
- **Guideline**: Identify direct/transitive consumers, breaking changes, migration plan, tests, rollback, and docs
- **CQ seed**: Can consumers of the changed dependency be found and verified?
- **PASS**: Impacted surfaces, compatibility plan, and tests are explicit
- **FAIL**: Dependency success is inferred from installation or compilation alone
- **Related documents**: dependency_rules.md; competency_qs.md CQ-DE, CQ-I

### Case SE-03: Schema or Data Model Change

- **Source evidence**: Large-scale ID/schema migrations such as Twitter Snowflake-style ID evolution; database migration practice
- **Observed failure**: Schema changes break existing data, API consumers, backfills, rollbacks, or source-of-truth assumptions
- **Review concern relevance**: logic, dependency, structure, evolution
- **Principle**: Data model changes are lifecycle and compatibility changes
- **Applicable when**: Entities, identifiers, constraints, indexes, event schemas, or storage formats change
- **Guideline**: Declare migration order, compatibility window, backfill/rollback path, source-of-truth transition, and verification queries
- **CQ seed**: Can old and new data coexist safely during migration?
- **PASS**: Migration, compatibility, validation, rollback, and observability are specified
- **FAIL**: The schema changes without data lifecycle or consumer compatibility evidence
- **Related documents**: logic_rules.md `Constraint Design Logic`; dependency_rules.md `Source of Truth Management`

### Case SE-04: Scale Expansion

- **Source evidence**: Netflix-style monolith-to-services and reliability evolution; SRE/error-budget practice
- **Observed failure**: A system grows in traffic, tenants, data, or teams while retaining single-node assumptions, synchronous bottlenecks, or missing observability
- **Review concern relevance**: structure, performance, operations, coverage
- **Principle**: Scale changes architecture, verification, and operational obligations
- **Applicable when**: Load, data volume, tenant count, team count, or availability expectations materially increase
- **Guideline**: Reassess concurrency, data partitioning, queues, caching, SLIs/SLOs, deployment strategy, incident response, and cost
- **CQ seed**: Which assumptions break at the new scale?
- **PASS**: Capacity, failure isolation, observability, and rollback/canary strategy are updated
- **FAIL**: The system scales by increasing resources without changing verification or failure boundaries
- **Related documents**: structure_spec.md `Quantitative Thresholds`; competency_qs.md CQ-P, CQ-O

### Case SE-05: Security Incident Response

- **Source evidence**: Log4Shell CVE-2021-44228; OWASP Top 10; NIST SSDF
- **Observed failure**: A security issue is found but affected assets, dependency graph, mitigations, patches, monitoring, and communication are incomplete
- **Review concern relevance**: security, dependency, operations, axiology
- **Principle**: Incident response is an engineering workflow with evidence and accountability
- **Applicable when**: Vulnerabilities, compromised dependencies, credential exposure, data leakage, or unsafe AI behavior are discovered
- **Guideline**: Identify affected versions/assets, mitigation, patch/rollout, detection, communication, postmortem, and preventive control updates
- **CQ seed**: Can the system locate and verify all affected dependency paths?
- **PASS**: Dependency graph, mitigation, tests, deploy evidence, monitoring, and disclosure path are complete
- **FAIL**: The fix updates a package but cannot prove affected surfaces are covered
- **Related documents**: dependency_rules.md `Dependency Security`; competency_qs.md CQ-SE, CQ-G-03

### Case SE-06: API Breaking Change

- **Source evidence**: Stripe-style versioned APIs; REST/gRPC/GraphQL compatibility practice
- **Observed failure**: API consumers break because changed fields, semantics, error modes, pagination, auth, or version behavior were not classified
- **Review concern relevance**: dependency, logic, pragmatics
- **Principle**: Public contract changes require explicit compatibility classification
- **Applicable when**: Request/response schema, auth, error semantics, ordering, pagination, rate limits, or side effects change
- **Guideline**: Classify breaking/non-breaking, identify consumers, version the contract, document migration, and test compatibility
- **CQ seed**: Are all public contract consumers protected from unannounced breakage?
- **PASS**: Compatibility classification, versioning, migration docs, and contract tests exist
- **FAIL**: A change is called internal while consumers can observe it
- **Related documents**: dependency_rules.md `API Dependency Management`; competency_qs.md CQ-I

### Case SE-07: Service or Feature Decommissioning

- **Source evidence**: Feature sunset and service retirement patterns; ISO/IEC/IEEE 12207 lifecycle scope
- **Observed failure**: A deprecated feature/service remains partially live through stale flags, docs, data, alerts, routes, permissions, or client dependencies
- **Review concern relevance**: evolution, conciseness, operations, coverage
- **Principle**: Retirement is part of the software lifecycle
- **Applicable when**: Features, services, APIs, models, prompts, tools, indexes, or data stores are removed or sunset
- **Guideline**: Define user communication, dependency removal, data retention/deletion, monitoring cleanup, fallback removal, and final verification
- **CQ seed**: Is the retirement complete across runtime, docs, data, dependencies, and operations?
- **PASS**: No stale authority, route, flag, alert, data obligation, or consumer remains without rationale
- **FAIL**: Retired behavior survives as dead flags, hidden routes, stale docs, or unused indexes
- **Related documents**: conciseness_rules.md `Dead Code and Feature Flags`; competency_qs.md CQ-MT, CQ-G-06

### Case SE-08: Data Retention or Deletion Request

- **Source evidence**: ISO/IEC/IEEE 12207 lifecycle scope; privacy/data-retention engineering practice
- **Observed failure**: User, tenant, regulated, or operationally retained data is deleted from the primary database but survives in caches, logs, indexes, backups, generated artifacts, analytics sinks, or downstream processors
- **Review concern relevance**: coverage, logic, dependency, security, axiology
- **Principle**: Data lifecycle obligations apply to derived stores, not only the primary source of truth
- **Applicable when**: The system stores personal, sensitive, tenant-scoped, regulated, or retained operational data
- **Guideline**: Classify data, declare retention purpose, trace deletion/erasure across primary and derived stores, and document any legally or operationally retained exception
- **CQ seed**: Can deletion or retention obligations be traced across every store and generated derivative?
- **PASS**: Data classes, retention rules, deletion path, derived-store coverage, exception rationale, and verification evidence are explicit
- **FAIL**: Deletion is implemented only for the primary table or excludes derived artifacts without a documented obligation
- **Related documents**: concepts.md `Data Classification`, `Retention Policy`, `Deletion/Erasure Path`; competency_qs.md CQ-D-09, CQ-SE-07

### Case SE-09: Release Artifact Provenance Gap

- **Source evidence**: SLSA provenance model; NIST SSDF; dependency and release-management practice
- **Observed failure**: A deployed package, container image, binary, or release bundle cannot be traced to source revision, build workflow, dependency inventory, verification result, approval gate, and deployment environment
- **Review concern relevance**: dependency, operations, security, pragmatics
- **Principle**: A release is a trust-bearing artifact, not only a successful build output
- **Applicable when**: Software is packaged, deployed, published, or consumed by downstream systems
- **Guideline**: Attach dependency inventory, vulnerability/license/security checks, signatures or attestations where required, and release-gate evidence to the shipped artifact identity
- **CQ seed**: Can the shipped artifact be reconstructed and verified from source to environment?
- **PASS**: Source, build, dependency inventory, verification, approval, artifact identity, and environment are linked
- **FAIL**: Operators can see a version string but cannot prove what source, dependencies, checks, or approvals produced it
- **Related documents**: dependency_rules.md `Release Artifact Provenance`; competency_qs.md CQ-O-07, CQ-DE-08

### Case SE-10: User-Facing Accessibility or Locale Gap

- **Source evidence**: WCAG 2.2 / ISO/IEC 40500:2025; ISO/IEC 25010 quality characteristics; internationalization practice
- **Observed failure**: Critical user-facing flows ship without accessibility acceptance criteria, assistive-technology checks, locale formatting tests, translation ownership, or text-direction handling
- **Review concern relevance**: coverage, axiology, pragmatics, verification
- **Principle**: User-facing quality includes who can use the system and whether locale-sensitive output remains correct
- **Applicable when**: A product has public, regulated, customer-facing, employee-facing, or locale-sensitive UI/API text
- **Guideline**: Define accessibility level, supported locales, formatting/text-direction rules, translation ownership, and verification checks for critical flows
- **CQ seed**: Are accessibility and locale obligations explicit and tested for critical user-facing paths?
- **PASS**: Requirements and tests cover accessibility, locale formatting, text direction where applicable, and ownership of translations or content updates
- **FAIL**: Accessibility/i18n is omitted, described qualitatively only, or left to manual inspection without target criteria
- **Related documents**: domain_scope.md `Accessibility and internationalization`; competency_qs.md CQ-R-03, CQ-V-11

## Scenario Interconnections

| Change type | Common follow-on cases |
|---|---|
| Prompt/model/provider migration | AI-02, AI-05, AI-08 |
| RAG/corpus/index change | AI-01, AI-04, AI-07 |
| Agent tool expansion | AI-02, AI-03, AI-06 |
| Generated authority artifact | AI-02, AI-07, AI-08 |
| Feature addition | SE-02, SE-03, SE-04, SE-06 |
| Dependency/security incident | SE-02, SE-05, SE-07, SE-09 |
| Decommissioning | SE-07 plus SE-08 for retained data and AI-04 when indexes/corpora are involved |
| Data retention/deletion | SE-08 plus AI-04 when vector indexes or corpora are involved |
| User-facing release | SE-01, SE-06, SE-10 |

## Related Documents

- domain_scope.md - activation conditions and value commitments
- concepts.md - canonical terms used by case cards
- logic_rules.md - logical gates and failure posture
- structure_spec.md - structural seats required by cases
- dependency_rules.md - dependency, supply-chain, and provenance rules
- competency_qs.md - CQ seeds and PASS/FAIL criteria
- prompt_interface.md - prompt/context/tool/output interface criteria
