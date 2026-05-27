---
status: applied_to_active_domain_docs
date: "2026-05-27"
owner: software-engineering-domain-redesign
scope: software-engineering domain documents
---

# Software Engineering Domain Zero-Based Redesign

## Purpose

Redesign the `software-engineering` domain from the top down after merging the former
`llm-native-development` domain into it.

The goal is not to create a MECE taxonomy. The goal is to make the domain useful to
the review lenses. A domain principle is strong enough only when it can be converted
into:

```text
lens perspective -> principle -> case evidence -> actionable guideline -> CQ
```

Overlap between lenses is allowed. The same case may support different CQs for
`logic`, `structure`, `dependency`, `semantics`, `pragmatics`, `evolution`,
`coverage`, `conciseness`, and `axiology`.

## Application Status

As of 2026-05-27, the redesign has been applied to the active
`.onto/domains/software-engineering/` documents at the skeleton and primary-detail
level:

- `domain_scope.md` now owns the top-down concern stack, axiology input, activation
  conditions, current standards anchors, and inter-document contract.
- `concepts.md`, `logic_rules.md`, `structure_spec.md`, `dependency_rules.md`, and
  `prompt_interface.md` now carry the LLM/runtime/middleware, output zero-trust,
  RAG/vector, agent agency, provenance, and governance details.
- `competency_qs.md` now includes CQ-A extensions and CQ-G for governance,
  provenance, and value alignment.
- `extension_cases.md` is now a case-backed guideline library.
- `conciseness_rules.md` now distinguishes allowed lens overlap from harmful duplicate
  authority.
- `problem_framing_profile.md` now has closure axes for output trust, prompt
  injection boundary, RAG permission, agency, provenance, governance, and value
  tradeoff issues.

## Research Anchors

The redesign should treat the following as high-signal anchors, not as exhaustive
compliance checklists.

| Anchor | Design signal |
|---|---|
| NIST AI RMF 1.0 | AI risk management must cover design, development, deployment, and use; trustworthiness is an engineering concern, not only a policy concern |
| NIST AI 600-1 GenAI Profile | GenAI risk work needs governance, content provenance, pre-deployment testing, and incident disclosure |
| ISO/IEC 42001 | AI systems need management-system concepts: accountable ownership, risk treatment, traceability, transparency, continuous improvement |
| NIST SSDF SP 800-218 and SP 800-218A | AI model/system development should be integrated into secure software development evidence and release gates |
| OWASP LLM Top 10 2025 | LLM applications need concrete security CQs: prompt injection, sensitive disclosure, supply chain, poisoning, output handling, excessive agency, vector/embedding weaknesses, misinformation, unbounded consumption |
| SLSA | Trustworthy artifacts need provenance and verification summaries, not only successful builds |
| ISO/IEC/IEEE 12207:2026 | Software engineering spans acquisition, supply, development, operation, maintenance, support, and retirement |
| ISO/IEC 25010:2023 | Quality characteristics should drive requirements, design objectives, testing objectives, acceptance criteria, and measures |
| ISO/IEC/IEEE 29148 | Requirements work needs required processes and required information items, not only prose intent |
| WCAG 2.2 / ISO/IEC 40500:2025 | Accessibility should use the current stable standard, not an older reference by default |

## Zero-Based Design Commitments

1. **Lens-first, not taxonomy-first**
   - Each domain document exists because at least one review lens consumes it.
   - The document's shape should make that lens better at finding issues.

2. **Case-backed principles**
   - A principle must have at least one concrete failure case, operational example,
     or standard-backed scenario.
   - If no case can be found, the principle remains a candidate, not a canonical rule.

3. **CQ-ready guidance**
   - Every canonical principle should yield at least one competency question with
     PASS/FAIL criteria.
   - A principle without a possible CQ is too vague for the domain.

4. **Overlap is normal**
   - Lenses are perspectives, not partitions.
   - Example: prompt injection can be a security issue, a dependency issue, a
     structure issue, a pragmatic CQ issue, and an axiology issue at the same time.

5. **Behavior artifact parity**
   - Prompt templates, context assembly rules, retrieval policies, tool schemas,
     model/provider choices, eval rubrics, and agent instructions are
     behavior-affecting artifacts, comparable to code/config.

6. **Ownership boundaries are first-class**
   - LLM, runtime, and middleware ownership must be explicit.
   - Runtime owns deterministic binding, validation, state, persistence, auth,
     idempotency, cost/security gates, and artifact assembly.
   - LLM owns semantic interpretation, judgment, exploration, and source-layer
     reasoning inside the contracted role.
   - Middleware owns transport, envelope conversion, routing plumbing,
     auth/context propagation, retry envelopes, and observability plumbing.

7. **Fail-loud for development/review/authority paths**
   - Hidden fallback is a defect when it hides the failing prompt, context,
     retrieval, model/provider, tool schema, validator, or artifact boundary.
   - User-facing production flows may degrade only with visible loss, trust status,
     diagnostics, and recovery path.

8. **Governance is engineering material**
   - AI risk ownership, approval gates, human oversight, incident disclosure,
     model/provider change management, and audit evidence are domain concerns.
   - They should not live only in policy documents outside engineering review.

9. **Lifecycle is broader than implementation**
   - The domain must cover acquisition/supply, development, deployment, operation,
     maintenance, decommissioning, and retirement.
   - LLM-native artifacts inherit this lifecycle.

10. **Source provenance beats implicit trust**
    - Claims, generated artifacts, retrieval results, eval outcomes, and build
      outputs need provenance when they affect trust or release decisions.

## Target Domain Document Architecture

| File | Canonical job | Primary lens consumers | Redesign instruction |
|---|---|---|---|
| `domain_scope.md` | Domain charter, activation conditions, value commitments, high-level concern map, standard anchors | `coverage`, `axiology`, `pragmatics` | Keep high-level. Move long operational details and examples out. Add AI governance and lifecycle commitments |
| `concepts.md` | Canonical terms, homonyms, semantic distinctions | `semantics`, `logic`, `conciseness` | Keep compact. Add only terms needed by rules/CQs. Avoid near-duplicate LLM terms |
| `logic_rules.md` | Rule contradictions, trust gates, validation logic, failure posture | `logic` | Split LLM rules by ownership, output trust, prompt injection limits, failure posture |
| `structure_spec.md` | Required components and required relationships | `structure` | Add AI governance/eval/red-team/incident/RAG permission structures as applicable components |
| `dependency_rules.md` | Direction, supply chain, provider/model/tool/dataset dependencies | `dependency`, `evolution` | Treat model, dataset, prompt framework, embedding index, tool, provider, and generated artifact provenance as dependencies |
| `competency_qs.md` | Lens-usable questions with PASS/FAIL criteria | `pragmatics`, all lenses indirectly | Convert principles and cases into CQ families. Keep CQ prefixes conflict-free |
| `extension_cases.md` | Case evidence and change scenarios | `evolution`, `coverage`, `pragmatics`, `axiology` | Reframe as case-backed guideline library. Each case should include guideline and CQ seeds |
| `conciseness_rules.md` | Ontology-level parsimony rules | `conciseness` | Keep as concept economy guard. Add when overlap is allowed vs when duplication is harmful |
| `prompt_interface.md` | Prompt/role/tool/context/response interface criteria | `logic`, `structure`, `pragmatics` | Keep as interface contract. Add output sink rules and tool permission rules |
| `problem_framing_profile.md` | Software-specific issue closure axes | `synthesize`, problem framing | Add governance/risk/provenance/incident axes only when they affect closure |

## Lens-To-Content Design

### `logic`

What it needs:

- Rules that can contradict.
- Boundary and trust claims that can be checked for simultaneous satisfiability.
- Clear modality: required, allowed, forbidden, product-only, review-only.

Principles to support:

- Prompt instruction is not a security boundary.
- LLM output is untrusted until runtime validates it for the target sink.
- Runtime/middleware cannot silently repair semantic meaning.
- Degraded output cannot become authority truth without explicit trust status.

CQ pattern:

```text
Does the system claim LLM output is trusted while also lacking sink-specific validation?
PASS if every downstream sink has validation/encoding/authorization before use.
FAIL if prompt format instructions are treated as a validation guarantee.
```

### `structure`

What it needs:

- Required components and relationships.
- Orphan detection.
- Missing operational paths.

Principles to support:

- LLM-native systems need explicit seats for prompt/context artifacts, model/provider config,
  tool registry, eval baseline, observability, incident response, and failure diagnostics.
- RAG needs ingestion, validation, indexing, retrieval, permission filtering, provenance, and audit logging.
- AI governance needs owner, approval gate, risk register, and incident disclosure path when risk is material.

CQ pattern:

```text
Can the path from untrusted source material to model context to evidence-backed claim be traced?
PASS if ingestion, validation, retrieval, provenance, and output claim refs are connected.
FAIL if retrieved material can influence claims without a recorded source and retrieval path.
```

### `dependency`

What it needs:

- Direction rules.
- External dependency facts.
- Provenance and supply chain boundaries.

Principles to support:

- Model/provider/version is a behavior dependency.
- Embedding model changes require index compatibility handling.
- Prompt framework, tool runtime, eval judge, and retrieval corpus are behavior dependencies.
- Generated artifacts should preserve provenance when they affect trust.

CQ pattern:

```text
Can a model/provider or embedding model change be evaluated without hidden behavior drift?
PASS if prompts, tool schemas, retrieval indexes, eval baselines, dashboards, and cost/rate assumptions are listed as affected dependencies.
FAIL if the provider is swapped as an implementation detail with no semantic regression path.
```

### `semantics`

What it needs:

- Canonical terms and homonym guards.
- External standard mapping.
- Meaning distinctions that change review outcome.

Principles to support:

- "model" must distinguish domain model, data model, and LLM model.
- "validation" must distinguish prompt instruction, schema validation, sink validation, and semantic evaluation.
- "middleware" must not be allowed to blur transport adaptation with policy authority.

CQ pattern:

```text
Is "validation" used with one meaning in a claim?
PASS if the document identifies whether it means schema validation, sink validation, policy gate, or semantic eval.
FAIL if one word hides multiple trust boundaries.
```

### `pragmatics`

What it needs:

- CQs that can be answered from artifacts.
- PASS/FAIL criteria.
- Case-shaped questions that reduce ambiguity.

Principles to support:

- A guideline is useful only when a reviewer can ask and answer it.
- AI-era CQs should be scenario-shaped, not only abstract.

CQ pattern:

```text
If an external webpage contains hidden instructions, can it cause tool execution or data exfiltration?
PASS if external content is treated as data, tool calls are runtime-authorized, and exfiltration sinks are blocked or approved.
FAIL if the model alone is trusted to ignore hostile content.
```

### `evolution`

What it needs:

- Change scenarios.
- Compatibility and migration rules.
- Future drift simulations.

Principles to support:

- Model/provider change is a behavior migration.
- Prompt/context/tool changes are release changes.
- RAG corpus changes can alter behavior, permissions, and provenance.
- AI standards and incident patterns evolve quickly, so the domain needs periodic updates.

CQ pattern:

```text
When a model provider deprecates a model, can the system migrate without losing behavior evidence?
PASS if old/new behavior is compared with eval baselines and affected artifacts are listed.
FAIL if the route is updated without semantic comparison or cost/rate/latency reassessment.
```

### `coverage`

What it needs:

- Concern map and bias criteria.
- Standard anchors and missing area signals.

Principles to support:

- Software engineering now includes AI-assisted and AI-powered engineering work.
- Coverage should include governance, lifecycle, security, supply chain, evaluation, operations, and retirement.
- It does not need MECE decomposition.

CQ pattern:

```text
Does the review target include LLM behavior but omit AI governance, eval, prompt/context, retrieval, tool, or provider concerns?
PASS if applicable AI-native concerns have at least one artifact or explicit non-applicability rationale.
FAIL if AI behavior is treated as ordinary API integration only.
```

### `conciseness`

What it needs:

- Rules for allowed overlap vs harmful duplication.
- Concept economy criteria.

Principles to support:

- Lens overlap is allowed when each lens asks a different question.
- Duplicate terms are harmful when they create competing authority or hide the canonical owner.
- Case evidence may repeat across lens sections, but concept definitions should not fork.

CQ pattern:

```text
Does the same LLM boundary rule appear as competing definitions in multiple files?
PASS if one file defines the concept and others reference it.
FAIL if the same term has multiple active definitions with different obligations.
```

### `axiology`

What it needs:

- Domain value commitments.
- Purpose and stakeholder anchors.
- Tradeoff rules.

Principles to support:

- Fast AI-assisted development must not erase accountability, user harm, evidence, or operator diagnosability.
- Fail-loud is a value choice for development/review/authority paths because it reduces exploration cost and preserves truth.
- User-facing degradation must protect user agency by surfacing capability loss and recovery options.

CQ pattern:

```text
Does a local optimization make the system easier to demo while hiding trust loss or user harm?
PASS if the tradeoff is explicit, bounded, and recoverable.
FAIL if apparent usefulness depends on hiding missing evidence, degraded quality, or unsafe autonomy.
```

## Top-Down Concern Stack

The redesigned domain should be organized around this stack, then mapped into existing
files.

1. **Purpose and value**
   - Why this domain exists.
   - What harms it must notice.
   - Which stakeholder or operator promises matter.

2. **Lifecycle and governance**
   - Acquisition/supply, development, deployment, operation, support, maintenance,
     incident response, decommissioning, retirement.
   - AI risk ownership, approval gates, governance evidence, continuous improvement.

3. **Architecture and state**
   - Modules, interfaces, data flow, source of truth, state transitions, concurrency,
     eventing, boundaries.

4. **Contract and dependency truth**
   - Types, schemas, APIs, package dependencies, provider/model dependencies,
     prompt/context/tool dependencies, provenance.

5. **Verification and operations**
   - Static checks, tests, semantic eval, red-team evidence, release gates,
     observability, drift detection, incident disclosure.

6. **LLM-native behavior controls**
   - Prompt/context contracts, output zero-trust, retrieval/RAG boundaries,
     agent agency minimization, model/provider routing, failure posture.

7. **Case evidence and CQ library**
   - Case-backed guideline cards.
   - CQ seeds with PASS/FAIL criteria.
   - Lens mapping.

## Principle Decisions

### Keep

- Fail-loud over silent degradation for development, review, and authority paths.
- Fail-close plus fail-loud as complementary gates.
- Runtime as deterministic contract executor and conformance gate.
- LLM/runtime/middleware ownership split.
- Prompt path as reference realization, not a rough prototype.
- Semantic quality separated from deterministic correctness.
- Artifact truth over public-response truth.

### Add

- AI governance and risk ownership.
- LLM output zero-trust and sink-specific validation.
- RAG/vector permission boundary, poisoning prevention, retrieval audit, and
  behavior drift checks.
- Agent agency minimization: functionality, permissions, autonomy.
- AI supply chain and provenance for model, dataset, provider, prompt, eval set,
  tool, generated artifact.
- Incident disclosure and red-team/eval feedback loop.
- Lifecycle coverage for acquisition/supply and retirement/disposal.
- Current standards: WCAG 2.2 / ISO/IEC 40500:2025 and ISO/IEC/IEEE 29148.

### Split

- `LLM Safety & Alignment` into:
  - AI security threat handling
  - sensitive data and privacy
  - governance/risk ownership
  - human oversight and approval
  - content/source provenance
  - red-team and incident loop
- `Semantic Evaluation` into:
  - eval design
  - release gate
  - production drift monitoring
  - AI-as-judge disclosure and calibration
- `Retrieval & Knowledge Systems` into:
  - ingestion/source validation
  - embedding/index compatibility
  - permission-aware retrieval
  - evidence provenance
  - retrieval audit/logging
  - retrieval-induced behavior drift

### Integrate

- `Prompt & Context Contracts` with behavior artifact parity.
- `LLM Boundary`, `Runtime Boundary`, and `Middleware Boundary` under one
  ownership-boundary concept family.
- `Fail-Loud`, `Fail-Close`, `Silent Degradation`, and `Graceful Degradation`
  under one failure-posture family, while keeping separate CQs.

### De-emphasize or move

- Long case-study prose should move out of `domain_scope.md` and into
  `extension_cases.md`.
- Older standards should remain historical references only when still useful:
  - `IEEE 830` -> prefer `ISO/IEC/IEEE 29148` for current requirements engineering.
  - `WCAG 2.1` -> prefer `WCAG 2.2 / ISO/IEC 40500:2025`.
- Avoid turning external frameworks into checklist compliance unless a lens needs
  a concrete review question.

## Case-Backed Guideline Card Format

Use this format inside `extension_cases.md` or a future casebook section.

```text
Case ID:
Source evidence:
Observed failure:
Lens relevance:
Principle:
Applicable when:
Guideline:
CQ seed:
PASS:
FAIL:
Related documents:
```

The card is accepted only if `Guideline`, `CQ seed`, `PASS`, and `FAIL` are all
specific enough for a lens to use.

## Initial Case Evidence Backlog

| Case | Source | Guideline seed | CQ seed |
|---|---|---|---|
| Direct/indirect prompt injection | OWASP LLM01 | Treat external prompt/web/file/RAG content as untrusted data, not instruction authority | Can external content alter tool permissions, output trust, or critical decisions? |
| Improper output handling | OWASP LLM05 | Treat LLM output as untrusted input before downstream sinks | Is model output validated/encoded for shell, SQL, HTML, file path, email, and API sinks before use? |
| Excessive agency | OWASP LLM06 | Minimize functionality, permissions, and autonomy separately | Does each agent tool expose only necessary functions, least privilege, and approval for high-impact actions? |
| Vector/embedding weakness | OWASP LLM08 | RAG requires permission-aware retrieval, source validation, poisoning checks, and immutable retrieval logs | Can retrieved evidence cross tenant/user boundaries or inject hidden instructions into model context? |
| GenAI governance | NIST AI RMF and NIST AI 600-1 | Govern, map, measure, and manage GenAI risks with provenance, testing, and incident disclosure | Does the AI behavior have a risk owner, approval gate, pre-deployment evidence, and incident path? |
| AI management system | ISO/IEC 42001 | AI use needs accountable policies, objectives, risk treatment, traceability, and continuous improvement | Can the responsible owner and risk treatment for this AI capability be identified? |
| Secure AI development | NIST SSDF and SP 800-218A | AI development artifacts should participate in secure SDLC evidence | Are model/prompt/tool/retrieval changes tied to secure development checks and release gates? |
| Artifact provenance | SLSA | Trustworthy artifacts need provenance and verification summaries | Can generated artifacts be traced back to source, builder/agent, inputs, and verification state? |
| Full software lifecycle | ISO/IEC/IEEE 12207 | Software concerns include acquisition, supply, operation, maintenance, support, retirement | Does the domain cover supply/acquisition and retirement paths, not only build-time concerns? |
| Quality model | ISO/IEC 25010 | Quality characteristics should drive requirements, design objectives, tests, acceptance criteria, and measures | Are non-functional claims tied to test objectives or measurable acceptance criteria? |

## Migration Plan

### Phase 1 - Redesign the skeleton

Edit active docs only enough to establish the new shape:

1. `domain_scope.md`
   - Add domain purpose and value commitments.
   - Replace long examples with high-level concern map.
   - Add AI governance, lifecycle, supply/acquisition, retirement, and current standards.

2. `competency_qs.md`
   - Add CQ families for:
     - output zero-trust
     - prompt injection and external-content boundary
     - RAG/vector permission and poisoning
     - agent agency minimization
     - AI governance/risk ownership
     - AI supply chain/provenance
     - incident disclosure/red-team loop
   - Keep existing CQ prefixes stable unless a new non-conflicting prefix is needed.

3. `extension_cases.md`
   - Convert selected research examples into case-backed guideline cards.
   - Keep older software case studies only when they produce a clear guideline and CQ.

### Phase 2 - Populate lens seats

1. `logic_rules.md`
   - Add prompt injection limitations, output zero-trust, trust status, and sink-specific
     validation rules.

2. `structure_spec.md`
   - Add required/conditional structures for AI governance, eval harness, red-team loop,
     incident path, RAG permission layer, and output sink validation.

3. `dependency_rules.md`
   - Add model/provider, dataset/corpus, embedding index, prompt framework, eval judge,
     tool runtime, and generated artifact provenance dependencies.

4. `concepts.md`
   - Add only concepts that are referenced by rules or CQs.
   - Avoid adding broad AI governance vocabulary unless it affects review decisions.

5. `prompt_interface.md`
   - Add sink-specific output handling and tool permission interface criteria.

6. `conciseness_rules.md`
   - Add overlap policy: case overlap is allowed; competing definitions are not.

### Phase 3 - Verify with the review system

Run checks in this order:

1. Static markdown/link/reference checks available in the repo.
2. `git diff --check`.
3. `npm run check:ts-core` only if runtime refs or package-facing domain discovery changed.
4. Mock `software-engineering` review over the changed domain docs with selected lenses:
   - `coverage`
   - `pragmatics`
   - `logic`
   - `structure`
   - `dependency`
   - `axiology`
5. Address findings by preserving lens-specific overlap instead of forcing MECE cleanup.

## Completion Criteria

The redesign is complete when:

1. Each major principle has at least one case-backed guideline.
2. Each case-backed guideline yields at least one CQ with PASS/FAIL criteria.
3. Each review lens has an explicit domain document seat.
4. AI-native concerns are integrated into `software-engineering`, not treated as a second domain.
5. The docs distinguish:
   - semantic judgment vs deterministic authority
   - output schema validity vs sink safety
   - retrieval relevance vs evidence provenance
   - agent capability vs permission vs autonomy
   - graceful degradation vs hidden fallback
   - eval success vs production drift resistance
6. The review runtime can consume the changed domain without listing
   `llm-native-development` as a separate selectable domain.
