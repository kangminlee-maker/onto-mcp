---
version: 8
last_updated: "2026-05-28"
source: zero-based-software-engineering-redesign
status: established
---

# Software Engineering Domain - Domain Scope Definition

This document is the coverage and axiology entrypoint for the `software-engineering`
domain. It defines what a software review must be able to notice.

`software-engineering` is the canonical domain for conventional software engineering,
AI-assisted development, and LLM-powered product/runtime behavior. The former
`llm-native-development` domain is a compatibility alias only. A reviewer should not
run a second domain review to cover AI behavior; this domain activates AI-era concerns
when the target uses LLMs, agents, model providers, prompt/context contracts, retrieval,
semantic evaluation, AI-assisted workflows, or tool-call boundaries.

The domain is not a MECE taxonomy. It is a lens-usable concern map. A concern is strong
enough for active scope when it can support:

```text
lens perspective -> principle -> case evidence -> actionable guideline -> CQ
```

## Domain Purpose

Software engineering review should detect whether a software system can be understood,
changed, verified, operated, trusted, and retired without hiding the authority, evidence,
or value tradeoffs that make the system work.

The domain covers the full lifecycle:

1. acquisition and supply
2. requirements and design
3. implementation
4. verification and release
5. operation and incident response
6. maintenance and evolution
7. decommissioning and retirement

LLM-native artifacts inherit this lifecycle. Prompts, context assembly rules, tool
schemas, retrieval indexes, model/provider routes, eval rubrics, agent instructions, and
generated authority artifacts are behavior-affecting software artifacts.

## Axiology Input

Axiology uses this domain input to identify value conflicts; it does not treat these
statements as predetermined conclusions.

| Value commitment | Review signal |
|---|---|
| Diagnosability over false smoothness | Silent fallback, hidden repair, or unmarked degradation is suspect when it hides the failing boundary |
| Artifact truth over response truth | Public responses may summarize durable artifacts but must not become the authority seat |
| Accountability over automation theater | Agent autonomy must preserve owner, approval, audit, and recovery paths |
| Evidence over plausibility | Generated or retrieved claims need provenance when they affect trust, release, or user decisions |
| Explicit loss over invisible degradation | User-facing degradation is acceptable only when capability loss, trust status, diagnostics, and recovery are visible |
| Least agency over broad capability | Agent functionality, permissions, and autonomy must be minimized separately |
| Governance as engineering material | AI risk ownership, approval gates, incident disclosure, and continuous improvement are reviewable engineering concerns |
| Accessibility and user agency | Speed or productivity claims do not justify excluding affected users or hiding control from operators |

## Top-Down Concern Stack

Reviewers should reason from the top down before diving into local implementation detail.

| Layer | What to look for | Primary lens consumers |
|---|---|---|
| Purpose and value | Stakeholder promises, harms, accountability, tradeoffs, non-negotiable constraints | axiology, coverage, pragmatics |
| Lifecycle and governance | Acquisition/supply, approval gates, risk ownership, incident response, retirement | coverage, axiology, evolution |
| Architecture and state | Modules, interfaces, state transitions, source of truth, concurrency, data flow | structure, logic, dependency |
| Contract and dependency truth | Types, schemas, APIs, package dependencies, provider/model/tool/corpus dependencies | dependency, logic, semantics |
| Verification and operations | Tests, static checks, semantic eval, red-team evidence, release gates, observability, drift detection | pragmatics, coverage, evolution |
| LLM-native behavior controls | Prompt/context contracts, output zero-trust, retrieval boundaries, agent agency, model routing, failure posture | logic, structure, dependency, axiology |
| Case evidence and CQ library | Case-backed guideline cards and PASS/FAIL review questions | pragmatics, evolution, coverage |

## Major Sub-areas

Applicability markers:

- **required**: must be addressed in every software review.
- **when applicable**: required when the target uses the relevant pattern.
- **scale-dependent**: required beyond a documented scale, exposure, or risk threshold.

| Sub-area | Applicability | Review substance |
|---|---|---|
| Data and state | required | entities, schemas, source of truth, invariants, migrations, state transitions, consistency, retention/disposal |
| Interface and contract | required | APIs, types, schemas, versioning, requirements, acceptance criteria, backward compatibility |
| Error and failure posture | required | error taxonomy, fail-close gates, fail-loud diagnostics, recovery paths, user-facing loss markers |
| Security and authorization | required | authn/authz, input/output validation, injection prevention, secrets, privacy, supply chain, abuse boundaries |
| Verification and quality | required | unit/integration/E2E/static checks, semantic eval, quality attributes, release gates, measurable acceptance criteria |
| Architecture and structure | required | module/layer boundaries, dependency direction, state ownership, deployment topology, consumer surfaces |
| Operations and maintenance | required for operated systems | CI/CD, observability, incident response, SLOs, drift detection, maintenance classification, retirement |
| Documentation and consumers | when applicable | human/agent readers, contract vs guide docs, authority seats, diagrams, onboarding and handoff paths |
| LLM-native and agentic behavior | when applicable | model/provider routing, prompts, context, retrieval, tools, agents, eval, provenance, failure diagnostics |
| AI governance and risk | when applicable | risk owner, approval gate, human oversight, transparency, red-team loop, incident disclosure, continuous improvement |
| Accessibility and internationalization | scale-dependent | WCAG/current accessibility baseline, locale/time/currency/text-direction behavior, assistive technology support |

## LLM-Native Activation Conditions

Activate LLM-native review concerns when any of the following is true:

- product behavior depends on a model call, agent loop, retrieval result, or generated output.
- development/review/release workflow depends on LLM-generated artifacts.
- prompt templates, tool schemas, eval rubrics, or model/provider routes influence behavior.
- external content enters model context through files, webpages, RAG, search, or user-provided text.
- model output can trigger tool calls, persistence, authority artifacts, user-visible decisions, or downstream sinks.

When activated, the target must address:

- LLM/runtime/middleware ownership split.
- output zero-trust and sink-specific validation.
- prompt injection and external-content authority limits.
- RAG/vector ingestion, permission, poisoning, provenance, and audit boundaries.
- agent functionality, permission, and autonomy minimization.
- semantic evaluation and production drift monitoring.
- fail-loud diagnostics for development/review/authority paths.
- explicit degraded-state behavior for product paths.
- AI governance/risk ownership when behavior can materially affect users, operators, security, or release decisions.

## Required Concept Categories

| Category | Risk if missing | Example failure |
|---|---|---|
| Happy path | Functional intent is incomplete | API returns 200 but response body semantics are unspecified |
| Error path | Failures are defenseless or hidden | Runtime catches and ignores validation errors |
| Boundary condition | Edge cases break correctness | Empty input, max value, clock skew, race, or overflow is unhandled |
| Concurrency | Parallel or asynchronous access breaks safety | Race, deadlock, resource exhaustion, or ordering assumption corrupts state |
| Lifecycle | Resources or obligations survive past use | Data, feature flags, services, or AI indexes have no retirement path |
| Traceability | Review cannot explain why behavior changed | A prompt/provider change has no decision record or eval comparison |
| Source of truth | Conflicts cannot be resolved | Cache, DB, generated artifact, and public response disagree |
| Authority boundary | A layer silently takes over another layer's responsibility | Middleware repairs semantic meaning and becomes hidden policy authority |
| Observability | Operators cannot diagnose behavior | Model/tool failures lack prompt, route, schema, or artifact refs |
| Provenance | Evidence cannot be trusted | Retrieved or generated claims lack source and builder/agent trace |
| Agency boundary | Automation exceeds intended control | Agent can call high-impact tools without approval or least privilege |
| Semantic evaluation | Route success is mistaken for quality | Schema-valid model output is hallucinated or unfaithful |
| Governance path | Risk has no accountable owner | AI feature ships without approval gate, incident path, or red-team feedback loop |

## Reference Standards and Frameworks

These anchors provide review signals, not checklist-compliance obligations unless the
target explicitly claims conformance.

| Anchor | Use in this domain |
|---|---|
| NIST AI RMF 1.0 | AI risk framing across design, development, deployment, and use |
| NIST AI 600-1 GenAI Profile | GenAI governance, provenance, testing, incident disclosure, red-team loop |
| ISO/IEC 42001 | AI management-system concepts: ownership, objectives, risk treatment, traceability, improvement |
| NIST SSDF SP 800-218 and SP 800-218A | Secure development evidence for software and AI/foundation-model artifacts |
| OWASP LLM Top 10 2025 | Prompt injection, output handling, excessive agency, vector/embedding, supply-chain and resource risks |
| SLSA | Artifact provenance and verification summaries for supply-chain trust |
| ISO/IEC/IEEE 12207:2026 | Full software lifecycle, including acquisition, supply, operation, support, maintenance, retirement |
| ISO/IEC 25010:2023 | Quality characteristics as requirements, design objectives, tests, acceptance criteria, and measures |
| ISO/IEC/IEEE 29148 | Requirements processes and information items; preferred over IEEE 830 for current requirements work |
| WCAG 2.2 / ISO/IEC 40500:2025 | Current accessibility baseline for web/mobile/user-facing interfaces |
| OWASP Top 10 | General web application security risks |
| 12-Factor App, SRE, DORA | Operational design, reliability, deployability, and delivery performance |
| DDD, C4, Arc42, Clean/Hexagonal Architecture | Architecture documentation and boundary reasoning |

## Bias Detection Criteria

- If too many major sub-areas are absent, flag **coverage bias**. Count current sub-areas at review time and treat absence of roughly 40% or more as a strong signal.
- If a review target includes LLM behavior but omits prompts, context, model/provider, tool, retrieval, eval, and governance concerns, flag **AI-era engineering blind spot**.
- If fallback, repair, or graceful degradation hides the failing prompt, model, schema, tool, retrieval, or artifact boundary, flag **silent degradation bias**.
- If LLM, runtime, and middleware responsibilities are not separated, flag **ownership boundary bias**.
- If model output is trusted because the prompt requested a format, flag **output trust bias**.
- If retrieved material can influence claims without source provenance and permission-aware retrieval, flag **retrieval authority bias**.
- If agent capability, permission, and autonomy are discussed as one undifferentiated knob, flag **agency compression bias**.
- If governance, approval, incident response, or human oversight is treated as external policy only, flag **governance externalization bias**.
- If only implementation is discussed and acquisition/supply/operation/retirement are absent, flag **lifecycle narrowing bias**.
- If only unit tests are discussed for behavior with integration, semantic, security, or operational risk, flag **verification level bias**.
- If accessibility is outdated, qualitative, or omitted for a public/user-facing system, flag **accessibility currency bias**.

## Inter-Document Contract

| Topic | Owner file | Other files |
|---|---|---|
| Domain purpose, scope, value commitments, standards anchors | domain_scope.md | Other files reference |
| Domain-local concept definitions, domain projections, and homonym guards | concepts.md | Other files reference; onto/productization core concepts remain canonical in `.onto/authority/`, `.onto/principles/`, or `.onto/processes/` |
| Logical gates, contradiction rules, failure posture, trust rules | logic_rules.md | competency_qs.md asks; prompt_interface.md applies |
| Structural seats and required relationships | structure_spec.md | domain_scope.md activates; competency_qs.md verifies |
| Dependency direction, provider/model/tool/corpus dependencies, provenance dependencies | dependency_rules.md | structure_spec.md references |
| Prompt, role, context, tool, response, sink interface criteria | prompt_interface.md | logic_rules.md and structure_spec.md reference |
| Domain-specific CQs and PASS/FAIL criteria | competency_qs.md | All rule files provide inference paths |
| Case-backed guideline library | extension_cases.md | competency_qs.md can reuse CQ seeds |
| Concept economy and duplication policy | conciseness_rules.md | All files follow |
| Closure axes for issue stance and synthesize | problem_framing_profile.md | Review runtime consumes |

## Sub-area to CQ Mapping

| Sub-area | CQ sections |
|---|---|
| Data and state | CQ-D, CQ-T, CQ-B, CQ-C, CQ-SE |
| Interface and contract | CQ-I, CQ-R, CQ-E |
| Error and failure posture | CQ-E, CQ-A, CQ-G |
| Security and authorization | CQ-SE, CQ-A, CQ-DE, CQ-D |
| Verification and quality | CQ-V, CQ-P, CQ-A, CQ-G |
| Architecture and structure | CQ-S, CQ-M, CQ-C, CQ-DE |
| Operations and maintenance | CQ-O, CQ-MT, CQ-G, CQ-DE |
| Documentation and consumers | CQ-A, CQ-R, CQ-S |
| LLM-native and agentic behavior | CQ-A, CQ-SE, CQ-DE, CQ-G |
| AI governance and risk | CQ-G, CQ-A, CQ-O |
| Accessibility and internationalization | CQ-R, CQ-V, CQ-G |

## Related Documents

- concepts.md - canonical terms and homonym guards
- logic_rules.md - logical rules, trust gates, failure posture
- structure_spec.md - required structures and relationships
- dependency_rules.md - dependency and provenance rules
- prompt_interface.md - prompt, role, tool, context, output, and sink criteria
- competency_qs.md - domain competency questions
- extension_cases.md - case-backed guideline cards
- problem_framing_profile.md - closure axes for software-engineering review findings
