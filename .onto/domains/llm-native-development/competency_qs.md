---
version: 2
last_updated: "2026-05-27"
source: manual
status: established
---

# LLM-Native Development Domain — Competency Questions

A list of core questions that this domain's system must be able to answer.
The pragmatics agent verifies the actual reasoning path for each question.

Classification axis: **system construction concern** — classified by the sub-area of the LLM-powered system each question addresses, matching the 8 sub-areas defined in domain_scope.md.

Question priority principles: **Core design decisions (model integration, prompt design, retrieval, agent architecture) are the highest priority.** These concerns govern the majority of LLM system quality. Evaluation, safety, operations, and adaptation are secondary concerns applied on top of the core design foundation.

Priority levels:
- **P1** — Must be answerable for any LLM-powered system review. Failure indicates a fundamental design defect.
- **P2** — Should be answerable for production LLM systems. Failure indicates a quality gap.
- **P3** — Recommended for mature LLM systems. Failure indicates a refinement opportunity.

---

## 1. Model Integration (CQ-M)

Verifies that the system's connection to LLMs is reliable, replaceable, and explicitly designed. Without correct model integration, no other aspect of the system can function.

- **CQ-M01** [P1] Can the system switch between model providers or model versions without code changes beyond configuration?
  - Inference path: logic_rules.md 'Model Integration Logic' → model version pinning, model selection justification → model identity must be configurable
  - Verification criteria: PASS if model identifier is in configuration/env, not hardcoded. FAIL if changing models requires application code changes
  - Scope: Covers model identifier configurability. Does not cover prompt adjustments needed for different models (→CQ-P)

- **CQ-M02** [P1] Is the model version pinned to a specific release in production?
  - Inference path: logic_rules.md 'Model Integration Logic' → unpinned versions cause non-deterministic behavior; dependency_rules.md 'External Dependency Management' → Model API Dependencies → version must be pinned
  - Verification criteria: PASS if production uses a specific version (e.g., `claude-sonnet-4-20250514`). FAIL if production uses an alias (e.g., `claude-sonnet-4-latest`)

- **CQ-M03** [P1] Are fallback routes defined for every model routing path?
  - Inference path: logic_rules.md 'Model Integration Logic' → if model routing is used, fallback paths must be defined for every route; a route without fallback is a single point of failure
  - Verification criteria: PASS if every routing configuration entry includes a fallback model or degradation behavior (cached response, simpler model, error return). FAIL if any routing path has no defined fallback
  - Scope: Covers model-level routing. Does not cover application-level error handling for non-model failures

- **CQ-M04** [P1] Are model capability requirements documented per task type?
  - Inference path: logic_rules.md 'Model Integration Logic' → capability requirements must include task type, required capabilities, quality level, cost constraints; structure_spec.md 'Golden Relationships' → Model capability ↔ Prompt complexity
  - Verification criteria: PASS if documentation lists each task type, required model capabilities, and assigned model with justification. FAIL if model-task assignments exist without capability documentation

- **CQ-M05** [P2] Is model selection justified against cost and quality trade-offs?
  - Inference path: logic_rules.md 'Model Integration Logic' → overpowered model = cost waste, underpowered model = quality risk; logic_rules.md 'Constraint Conflict Checking' → Cost vs. Quality
  - Verification criteria: PASS if each model selection has documented cost/quality rationale. FAIL if selection lacks trade-off analysis

- **CQ-M06** [P2] When inference optimization is applied, is the impact on output quality measured?
  - Inference path: logic_rules.md 'Model Integration Logic' → optimization impact must be measured, not assumed
  - Verification criteria: PASS if evaluation results exist comparing quality before/after optimization. FAIL if optimization is applied without quality measurement

- **CQ-M07** [P2] Does the system handle model provider API errors gracefully?
  - Inference path: logic_rules.md 'Operations Logic' → incident response for LLM-specific failures; dependency_rules.md 'External Dependency Management' → Model API Dependencies
  - Verification criteria: PASS if retry logic, meaningful error messages, and graceful degradation exist. FAIL if API errors cause crashes or silent failures

- **CQ-M08** [P3] When multiple models are orchestrated, is the orchestration execution profile documented?
  - Inference path: structure_spec.md 'Agent Architecture Structure' → Multi-Agent Execution profile; domain_scope.md 'Model Integration' → multi-model orchestration
  - Verification criteria: PASS if multi-model pattern is documented with roles, routing logic, data flow. FAIL if undocumented

---

## 2. Prompt & Context Design (CQ-P)

Verifies that model inputs are structured, constrained, and managed to produce reliable outputs. Without correct prompt design, even the best model integration produces unpredictable results.

- **CQ-P01** [P1] Is the instruction hierarchy enforced (system prompt > tool definitions > user prompt)?
  - Inference path: logic_rules.md 'Prompt Design Logic' → instruction hierarchy: system prompt > tool definitions > user prompt; when levels conflict, higher-priority wins
  - Verification criteria: PASS if prompts have clear hierarchy and conflict resolution is documented (e.g., "system prompt overrides user instructions on output format"). FAIL if no hierarchy exists or user inputs can override system-level instructions
  - Scope: Covers instruction precedence design. Does not cover content quality of individual instructions

- **CQ-P02** [P1] Is the token budget calculated before API calls to prevent truncation?
  - Inference path: logic_rules.md 'Prompt Design Logic' → system prompt + context + user input ≤ context window - expected output; violation causes truncation (silent data loss) or API errors
  - Verification criteria: PASS if token counts for all prompt components are computed before the API call and oversized prompts are handled (graceful truncation with notification or rejection). FAIL if prompts may exceed the context window without pre-validation

- **CQ-P03** [P1] Is structured output validated before consumption?
  - Inference path: logic_rules.md 'Prompt Design Logic' → output schema must be validated; structure_spec.md 'LLM System Architecture Structure' → Output handling is required
  - Verification criteria: PASS if every code path expecting structured output includes schema validation. FAIL if model output is consumed without validation

- **CQ-P04** [P1] Are prompt templates versioned alongside code?
  - Inference path: logic_rules.md 'Prompt Design Logic' → prompt change = code change; unversioned prompts prevent reproduction
  - Verification criteria: PASS if prompt templates are in version control with change tracking. FAIL if prompts are unversioned

- **CQ-P05** [P2] Is context rot mitigated for long conversations?
  - Inference path: logic_rules.md 'Prompt Design Logic' → earliest context loses influence as conversation grows; critical info must be re-injected
  - Verification criteria: PASS if at least one mitigation strategy is implemented (re-injection, summarization, sliding window). FAIL if long conversations rely solely on initial context

- **CQ-P06** [P2] Are few-shot examples representative of the target distribution?
  - Inference path: logic_rules.md 'Prompt Design Logic' → biased examples cause biased outputs
  - Verification criteria: PASS if examples cover major target categories and are updated when distribution changes. FAIL if examples are ad-hoc or narrow

- **CQ-P07** [P2] Does the prompt template length stay within 25% of the context window?
  - Inference path: structure_spec.md 'Quantitative Thresholds' → prompt template ≤ 25% of context window
  - Verification criteria: PASS if static prompt ≤ 25% of target model's context window. FAIL if exceeded without justification

- **CQ-P08** [P2] When chain-of-thought prompting is used, is the reasoning trace verifiable?
  - Inference path: domain_scope.md 'Prompt & Context Design' → chain-of-thought patterns; logic_rules.md 'Prompt Design Logic' → structured output validation
  - Verification criteria: PASS if reasoning traces are captured and reviewable. FAIL if traces are generated but discarded

- **CQ-P09** [P3] Are prompt injection risks from user-supplied content addressed at the prompt level?
  - Inference path: logic_rules.md 'Safety Logic' → injection defense; logic_rules.md 'Prompt Design Logic' → user input is lowest priority
  - Verification criteria: PASS if user content is delimited or sanitized before inclusion in prompts. FAIL if user content is concatenated without boundary markers

- **CQ-P10** [P2] Is execution context free of non-current compatibility and deprecation material?
  - Inference path: conciseness_rules.md 'Navigation and History Mixing' → execution context should contain current behavior, contracts, authority, and failure handling; historical material belongs in isolated paths
  - Verification criteria: PASS if documents loaded for execution contain current behavior only and link to isolated history only when needed. FAIL if backward-compatibility notes, deprecated behavior, migration rationale, or historical alternatives are loaded by default

---

## 3. Retrieval & Knowledge Systems (CQ-R)

Verifies that external information fed to the model is retrieved correctly, structured for LLM consumption, and maintains integrity. Encompasses both RAG pipeline design and LLM-favored knowledge structure.

- **CQ-R01** [P1] Can retrieval quality be evaluated independently of generation quality?
  - Inference path: logic_rules.md 'Retrieval Logic' → retrieval relevance must be verified independently; root cause may be irrelevant retrieval, incorrect generation, or both; structure_spec.md 'RAG Pipeline Structure' → Stage Boundary Rules → each stage independently testable
  - Verification criteria: PASS if the system can produce retrieval results with relevance scores without running the generation step. FAIL if retrieval and generation are monolithic (testing retrieval requires the full pipeline)
  - Scope: Covers architectural separability. Does not cover evaluation methodology (→CQ-E)

- **CQ-R02** [P1] Do chunks preserve semantic boundaries?
  - Inference path: logic_rules.md 'Retrieval Logic' → chunking must preserve semantic boundaries
  - Verification criteria: PASS if chunks align with document structure (paragraphs, sections). FAIL if fixed-size splitting ignores content structure

- **CQ-R03** [P1] Is the LLM-favored structure (File=Concept, YAML frontmatter) consistently applied?
  - Inference path: logic_rules.md 'File–Concept Correspondence Logic' → one concept per file; logic_rules.md 'Frontmatter Conformance Logic'; structure_spec.md 'Frontmatter Specification'
  - Verification criteria: PASS if documents follow File=Concept paradigm with required frontmatter. FAIL if concepts are mixed across files or frontmatter is absent
  - Scope: Applies to document-based knowledge bases. N/A for database-only retrieval

- **CQ-R04** [P1] Is every concept file reachable from the entry point?
  - Inference path: logic_rules.md 'Navigation Path Logic' → unreachable file = isolated document; structure_spec.md 'Isolated Element Prohibition'
  - Verification criteria: PASS if traversal from entry point reaches every concept file. FAIL if any file is unreachable

- **CQ-R05** [P1] Are navigation indices (INDEX.md) up to date and consistent?
  - Inference path: structure_spec.md 'Project Required Files' → INDEX.md is source of truth for file existence; dependency_rules.md 'Referential Integrity'
  - Verification criteria: PASS if INDEX.md lists all directory files and all listed files exist. FAIL if stale or incomplete

- **CQ-R06** [P2] Does retrieved context carry provenance metadata?
  - Inference path: logic_rules.md 'Retrieval Logic' → provenance required for debugging; structure_spec.md 'RAG Pipeline Structure' → stage outputs carry metadata
  - Verification criteria: PASS if each chunk includes source ID, chunk ID, and relevance score. FAIL if no provenance

- **CQ-R07** [P2] When hybrid search is used, is the combination strategy explicit?
  - Inference path: logic_rules.md 'Retrieval Logic' → unspecified combination = non-reproducible results
  - Verification criteria: PASS if combination method and parameters are documented. FAIL if undocumented

- **CQ-R08** [P2] Does the embedding model match the content domain?
  - Inference path: logic_rules.md 'Retrieval Logic' → general-purpose embeddings may underperform on domain-specific content
  - Verification criteria: PASS if embedding model selection is justified with domain appropriateness and retrieval metrics. FAIL if unjustified

- **CQ-R09** [P2] When the embedding model changes, is re-indexing performed?
  - Inference path: dependency_rules.md 'External Dependency Management' → Embedding Model Dependencies → different models produce incompatible vectors
  - Verification criteria: PASS if documented migration includes complete re-indexing. FAIL if model changes can produce mixed embeddings

- **CQ-R10** [P2] Are RAG pipeline stages explicitly defined with input/output contracts?
  - Inference path: structure_spec.md 'RAG Pipeline Structure' → Required Stages (ingestion, processing, storage, retrieval, generation) with contracts
  - Verification criteria: PASS if each stage has documented inputs, outputs, and design decisions. FAIL if pipeline is monolithic

- **CQ-R11** [P3] Does single file size stay within the 500-line limit?
  - Inference path: structure_spec.md 'File Structure Required Elements' → 500 lines recommended; 'Quantitative Thresholds'
  - Verification criteria: PASS if ≤ 500 lines. WARNING if exceeded with justification. FAIL if exceeded without justification

- **CQ-R12** [P3] Does directory depth stay within the 3-level limit?
  - Inference path: structure_spec.md 'Directory Structure Rules' → max 3 levels
  - Verification criteria: PASS if ≤ 3 levels. FAIL if exceeded without justification

---

## 4. Agentic Systems (CQ-A)

Verifies that agent architecture, tool integration, and multi-agent coordination are reliable, terminable, and debuggable.

- **CQ-A01** [P1] Are tool definitions non-overlapping in their described capabilities?
  - Inference path: logic_rules.md 'Agentic Systems Logic' → if two tools can accomplish the same task, agent choice is non-deterministic; either remove overlap or add explicit routing instructions
  - Verification criteria: PASS if no two tools overlap in capability description, or overlapping tools have explicit disambiguation in agent instructions. FAIL if overlap exists without disambiguation

- **CQ-A02** [P1] Do all agent loops have explicit termination conditions?
  - Inference path: logic_rules.md 'Agentic Systems Logic' → without explicit termination (max iterations, convergence criteria, timeout), agent loops can run indefinitely, consuming resources
  - Verification criteria: PASS if every iterative agent workflow defines at least one termination condition. FAIL if any loop can run indefinitely without a termination mechanism

- **CQ-A03** [P1] Is agent state explicitly managed rather than relying on conversation history?
  - Inference path: logic_rules.md 'Agentic Systems Logic' → implicit state via conversation is fragile; structure_spec.md 'Agent Architecture Structure' → state management required
  - Verification criteria: PASS if critical state is in structured storage (DB, file, state object). FAIL if solely in conversation history
  - Scope: Covers critical state. Single-turn conversational context is acceptable as implicit

- **CQ-A04** [P1] Are MCP tool schemas self-describing?
  - Inference path: logic_rules.md 'Agentic Systems Logic' → schema must suffice without external docs; structure_spec.md 'Agent Architecture Structure' → Tool Definition Structure
  - Verification criteria: PASS if every tool has name, description, typed parameters, and return type. FAIL if external docs needed to understand usage

- **CQ-A05** [P2] Do agent instructions list available tools with usage guidance?
  - Inference path: logic_rules.md 'Agentic Systems Logic' → instructions must list tools and when to use each
  - Verification criteria: PASS if system prompt lists all tools with guidance. FAIL if tools are available but unmentioned

- **CQ-A06** [P2] For long-running tasks, is structured progress tracking maintained?
  - Inference path: logic_rules.md 'Agentic Systems Logic' → agent must resume from checkpoint without re-execution
  - Verification criteria: PASS if progress record tracks completed/current/remaining steps. FAIL if interruption requires full restart

- **CQ-A07** [P2] When multiple agents are used, is the coordination execution profile documented?
  - Inference path: structure_spec.md 'Agent Architecture Structure' → Multi-Agent Execution profile → must be documented with rationale
  - Verification criteria: PASS if execution profile, roles, communication patterns documented. FAIL if undocumented

- **CQ-A08** [P2] Is the agent tool count within the recommended limit (< 20)?
  - Inference path: structure_spec.md 'Quantitative Thresholds' → < 20 tools per agent
  - Verification criteria: PASS if < 20. WARNING if 20-30 with justification. FAIL if 30+ without evidence of unaffected selection quality

- **CQ-A09** [P3] Are tool call results validated before further reasoning?
  - Inference path: logic_rules.md 'Prompt Design Logic' → validate before consumption; 'Agentic Systems Logic' → tool results are part of agent state
  - Verification criteria: PASS if tool results undergo validation (error check, schema, sanity). FAIL if consumed without validation

---

## 5. Evaluation & Testing (CQ-E)

Verifies that system output quality is measured by defined criteria, representative data, and reproducible methods.

- **CQ-E01** [P1] Are evaluation criteria defined before system development begins (spec-first)?
  - Inference path: logic_rules.md 'Evaluation Logic' → criteria must be defined before development; defining after seeing output introduces confirmation bias
  - Verification criteria: PASS if evaluation criteria (metrics, thresholds, targets) are documented before or concurrent with the first development commit. FAIL if criteria are defined after the system is built
  - Scope: Covers existence and timing of criteria definition. Does not cover whether the criteria themselves are appropriate

- **CQ-E02** [P1] Does the golden set cover the target distribution?
  - Inference path: logic_rules.md 'Evaluation Logic'; structure_spec.md 'Evaluation Structure' → Golden Set Requirements → all input categories
  - Verification criteria: PASS if golden set covers all expected categories with documented diversity. FAIL if partial or undocumented coverage

- **CQ-E03** [P1] Is AI-as-judge bias disclosed?
  - Inference path: logic_rules.md 'Evaluation Logic' → must disclose judge model, prompt, and known biases
  - Verification criteria: PASS if all three disclosed. FAIL if any element missing

- **CQ-E04** [P2] Are evaluation pipelines automated and repeatable?
  - Inference path: logic_rules.md 'Evaluation Logic' → manual does not scale; structure_spec.md 'Evaluation Structure' → automated for production
  - Verification criteria: PASS if pipeline runs without manual intervention with consistent results. FAIL if manual steps required in production

- **CQ-E05** [P2] Is the golden set separated from training data?
  - Inference path: logic_rules.md 'Evaluation Logic' → contamination inflates scores; structure_spec.md 'Evaluation Structure' → Separation
  - Verification criteria: PASS if separate storage with contamination prevention. FAIL if shared without controls

- **CQ-E06** [P2] For A/B testing, are statistical significance thresholds predefined?
  - Inference path: logic_rules.md 'Evaluation Logic' → undefined thresholds enable peeking bias
  - Verification criteria: PASS if thresholds, sample sizes, stopping criteria predefined. FAIL if absent

- **CQ-E07** [P2] Does hallucination detection methodology exist?
  - Inference path: domain_scope.md 'Evaluation & Testing'; logic_rules.md 'Retrieval Logic' → independent retrieval/generation evaluation enables hallucination tracing
  - Verification criteria: PASS if documented detection method exists and is applied. FAIL if no method defined

- **CQ-E08** [P3] Are human evaluation protocols defined for aspects resisting automation?
  - Inference path: structure_spec.md 'Evaluation Structure' → manual acceptable for semantic quality; domain_scope.md 'Evaluation & Testing' → HITL
  - Verification criteria: PASS if protocols exist with inter-rater reliability measures. FAIL if human evaluation is ad-hoc

---

## 6. Safety & Alignment (CQ-S)

Verifies that harmful outputs are prevented, adversarial inputs are defended against, and safety mechanisms are testable and layered.

- **CQ-S01** [P1] Is defense-in-depth implemented (input filtering + output filtering + monitoring)?
  - Inference path: logic_rules.md 'Safety Logic' → no single safety mechanism is sufficient; minimum layers: input filtering + output filtering + monitoring; structure_spec.md 'Safety Architecture Structure' → Required Pipeline (input guardrails → model → output guardrails)
  - Verification criteria: PASS if the system implements at least input filtering, output filtering, and monitoring as separate layers. FAIL if only one safety layer exists or any of the three is absent
  - Scope: Covers layer presence. Effectiveness of individual layers checked in CQ-S02, CQ-S03

- **CQ-S02** [P1] Are content policy rules testable with positive and negative cases?
  - Inference path: logic_rules.md 'Safety Logic' → untestable rules cannot be verified
  - Verification criteria: PASS if every rule has ≥1 positive and ≥1 negative test case. FAIL if any rule lacks tests

- **CQ-S03** [P1] Is prompt injection defense present without unacceptable UX degradation?
  - Inference path: logic_rules.md 'Safety Logic' → false positive rate matters; structure_spec.md 'Quantitative Thresholds' → < 1% false positive rate
  - Verification criteria: PASS if defense exists with documented false positive rate < 1%. FAIL if no defense or unmeasured/high false positive rate

- **CQ-S04** [P1] Are safety constraints applied at the system level, not just model-level?
  - Inference path: logic_rules.md 'Safety Logic' → model safety is not configurable or auditable
  - Verification criteria: PASS if system-level guardrails exist independent of provider safety. FAIL if relying solely on model built-in safety

- **CQ-S05** [P2] Are guardrail trigger conditions, actions, and logging defined?
  - Inference path: structure_spec.md 'Safety Architecture Structure' → each guardrail must define all three
  - Verification criteria: PASS if every guardrail has trigger, action, and logging. FAIL if any element missing

- **CQ-S06** [P2] Is red teaming performed pre-deployment and on recurring schedule?
  - Inference path: logic_rules.md 'Safety Logic' → threat landscape evolves
  - Verification criteria: PASS if pre-deployment results documented and recurring schedule exists. FAIL if absent or one-time only

- **CQ-S07** [P2] Is PII detection and redaction implemented?
  - Inference path: domain_scope.md 'Safety & Alignment' → PII handling; logic_rules.md 'Constraint Conflict Checking' → Privacy vs. Personalization
  - Verification criteria: PASS if PII entry points identified with detection/redaction. FAIL if no PII controls

- **CQ-S08** [P3] When safety conflicts with functionality, is the conflict documented with improvement plan?
  - Inference path: logic_rules.md 'Constraint Conflict Checking' → Safety vs. Functionality → four required elements
  - Verification criteria: PASS if documented with rule, degraded functionality, false positive rate, improvement plan. FAIL if undocumented

---

## 7. Production Operations (CQ-O)

Verifies that runtime behavior is observable, costs tracked, quality monitored, and feedback actionable.

- **CQ-O01** [P1] Does cost tracking granularity match billing granularity?
  - Inference path: logic_rules.md 'Operations Logic' → mismatched granularity makes cost optimization guesswork
  - Verification criteria: PASS if tracking matches billing (per-token if billed per-token) with feature/user attribution. FAIL if coarser

- **CQ-O02** [P1] Does logging capture sufficient information to reproduce any LLM interaction?
  - Inference path: logic_rules.md 'Operations Logic' → logging must capture: full prompt (input), full response (output), model version, latency, token count, and tool calls; insufficient logging makes debugging impossible
  - Verification criteria: PASS if every LLM API call is logged with all six required fields. FAIL if any field is missing from production logs

- **CQ-O03** [P1] Is a quality drift baseline established?
  - Inference path: logic_rules.md 'Operations Logic' → baseline from golden set required for drift detection; dependency_rules.md 'Feedback Loops' → Loop 2
  - Verification criteria: PASS if baseline exists and drift detection runs at regular intervals. FAIL if no baseline or no monitoring

- **CQ-O04** [P2] Are feedback loops actionable (collection → analysis → system change → verification)?
  - Inference path: logic_rules.md 'Operations Logic' → feedback without improvement path is waste
  - Verification criteria: PASS if each feedback type has documented processing pipeline. FAIL if feedback collected without action path

- **CQ-O05** [P2] Is incident response defined for LLM-specific failure modes?
  - Inference path: logic_rules.md 'Operations Logic' → five failure types: outage, quality degradation, cost spike, safety false positives, injection
  - Verification criteria: PASS if playbooks exist for all five types. FAIL if LLM-specific failures not addressed

- **CQ-O06** [P2] Are deployment strategies appropriate for model updates?
  - Inference path: domain_scope.md 'Production Operations' → canary/blue-green; dependency_rules.md 'External Dependency Management' → canary rollout
  - Verification criteria: PASS if graduated deployment limits blast radius. FAIL if all-at-once without rollout

- **CQ-O07** [P2] Is system-level caching implemented where appropriate?
  - Inference path: domain_scope.md 'Production Operations' → response caching, KV cache management
  - Verification criteria: PASS if caching evaluated and implemented with invalidation rules. FAIL if no caching considered for repeated patterns

- **CQ-O08** [P3] Are monitoring dashboards covering LLM-specific metrics visible to operators?
  - Inference path: domain_scope.md 'Production Operations' → monitoring; logic_rules.md 'Operations Logic' → logging feeds dashboards
  - Verification criteria: PASS if dashboards show latency, error rate, throughput, cost. FAIL if no operator visibility

---

## 8. Data & Model Adaptation (CQ-D)

Verifies that fine-tuning decisions are justified, quality-controlled, and evaluated against baselines.

- **CQ-D01** [P1] Is fine-tuning justified over prompting?
  - Inference path: logic_rules.md 'Data & Model Adaptation Logic' → fine-tuning justified only when prompting alone cannot achieve required quality, latency, or cost targets; fine-tuning introduces maintenance burden
  - Verification criteria: PASS if documented analysis shows prompting was attempted first and was insufficient, with specific metrics. FAIL if fine-tuning pursued without evidence that prompting is insufficient
  - Scope: Applies when fine-tuning is used. N/A if system uses only prompting

- **CQ-D02** [P1] Is training data quality assessed before training?
  - Inference path: logic_rules.md 'Data & Model Adaptation Logic' → data quality upper-bounds model quality
  - Verification criteria: PASS if accuracy/consistency/completeness/representativeness assessed before training. FAIL if training starts without assessment

- **CQ-D03** [P1] Are adapted models evaluated against base models on the same set?
  - Inference path: logic_rules.md 'Data & Model Adaptation Logic' → comparison required to prove improvement
  - Verification criteria: PASS if comparison results exist on same golden set. FAIL if measured in isolation

- **CQ-D04** [P2] For parameter-efficient fine-tuning (LoRA, QLoRA), is the base model pinned?
  - Inference path: logic_rules.md 'Data & Model Adaptation Logic' → base model update invalidates adapters
  - Verification criteria: PASS if base model version recorded/pinned with invalidation process. FAIL if unpinned

- **CQ-D05** [P2] Is training data separated from evaluation data?
  - Inference path: logic_rules.md 'Evaluation Logic' → contamination inflates scores
  - Verification criteria: PASS if separate storage with deduplication controls. FAIL if shared without controls

- **CQ-D06** [P2] Does fine-tuning improvement exceed fine-tuning cost?
  - Inference path: logic_rules.md 'Data & Model Adaptation Logic'; logic_rules.md 'Constraint Conflict Checking' → Cost vs. Quality
  - Verification criteria: PASS if cost-benefit analysis documents quality gain vs. costs. FAIL if no analysis

- **CQ-D07** [P3] Is there a retraining plan for base model updates?
  - Inference path: dependency_rules.md 'External Dependency Management' → deprecation requires migration; logic_rules.md 'Data & Model Adaptation Logic' → adapters invalidated by updates
  - Verification criteria: PASS if documented retraining procedure covers detection, compatibility check, retraining, re-evaluation. FAIL if no plan

---

## 9. Cross-Cutting (CQ-X)

Verifies concerns spanning multiple sub-areas: version management, reproducibility, and inter-area consistency.

- **CQ-X01** [P1] Are prompt versions, tool schema versions, and agent configuration versions tracked?
  - Inference path: domain_scope.md 'Cross-Cutting Concern: Development Lifecycle' → version management spans prompt versions, tool schema versions, agent configuration versions, model version tracking; logic_rules.md 'Prompt Design Logic' → prompt change = code change, must be versioned
  - Verification criteria: PASS if all four artifact types (prompt templates, tool schemas, agent configurations, model version references) are version-controlled. FAIL if any of these artifacts is unversioned

- **CQ-X02** [P1] Can past system behavior be reproduced given a specific version of all components?
  - Inference path: logic_rules.md 'Operations Logic' → logging must capture sufficient info to reproduce interactions; 'Prompt Design Logic' → unversioned prompts = unreproducible behavior; dependency_rules.md 'External Dependency Management' → model version must be pinned
  - Verification criteria: PASS if, given a timestamp, all system components (model version, prompt version, tool schemas, retrieval config) can be identified and behavior reconstructed. FAIL if any component's historical state is unrecoverable

- **CQ-X03** [P2] When cross-area constraints conflict, is the conflict documented and resolved?
  - Inference path: logic_rules.md 'Constraint Conflict Checking' → four conflict types; unresolved = unpredictable behavior
  - Verification criteria: PASS if conflicts documented with constraint pair, resolution, trade-off rationale. FAIL if undocumented

- **CQ-X04** [P2] Do inter-area dependencies follow documented direction rules?
  - Inference path: dependency_rules.md 'Inter-Area Direction Rules'; 'Reverse direction prohibition'
  - Verification criteria: PASS if data flow matches documented directions. FAIL if reverse dependencies exist

- **CQ-X05** [P2] Are feedback loops between areas declared with termination conditions?
  - Inference path: dependency_rules.md 'Feedback Loops' → Loops 1-3, each with termination condition
  - Verification criteria: PASS if all cycles documented with termination. FAIL if any loop lacks termination

- **CQ-X06** [P3] Do the five golden relationships (cross-component validations) hold?
  - Inference path: structure_spec.md 'Golden Relationships' → Model↔Prompt, Retrieval↔Generation, Tool↔Instructions, Eval↔Safety, Cost↔Model
  - Verification criteria: PASS if all five validations pass. FAIL if any violated

---

## 10. Edge Cases (CQ-XE)

Tests boundary conditions and failure modes not covered by standard verification. Verifies system resilience.

- **CQ-XE01** [P2] What happens when a model is deprecated mid-production?
  - Inference path: dependency_rules.md 'External Dependency Management' → Model API Dependencies → deprecation migration plan
  - Verification criteria: PASS if deprecation plan covers detection, impact analysis, replacement evaluation, migration timeline. FAIL if no plan

- **CQ-XE02** [P2] What happens when retrieval returns no relevant results?
  - Inference path: logic_rules.md 'Retrieval Logic' → independent evaluation; structure_spec.md 'RAG Pipeline Structure' → relevance scores; logic_rules.md 'Constraint Conflict Checking' → Latency vs. Completeness
  - Verification criteria: PASS if system handles gracefully (fallback, disclaimer, rephrase suggestion). FAIL if generates as if relevant context existed

- **CQ-XE03** [P2] What happens when safety guardrails block a valid response?
  - Inference path: logic_rules.md 'Safety Logic' → defense without UX degradation; 'Constraint Conflict Checking' → Safety vs. Functionality
  - Verification criteria: PASS if false positives produce informative messages, are logged, and have adjustment process. FAIL if silent failure or no review process

- **CQ-XE04** [P2] What happens when an MCP server becomes unavailable during an agent task?
  - Inference path: dependency_rules.md 'External Dependency Management' → MCP Server Dependencies → fallback behavior; logic_rules.md 'Agentic Systems Logic' → state survives failures
  - Verification criteria: PASS if fallback defined (skip, retry, halt with message). FAIL if crash, hang, or undefined behavior

- **CQ-XE05** [P2] What happens when the token budget is exceeded by user input alone?
  - Inference path: logic_rules.md 'Prompt Design Logic' → token budget constraint
  - Verification criteria: PASS if oversized input detected with defined action (truncation notice, rejection). FAIL if silent truncation or unhandled error

- **CQ-XE06** [P3] What happens when a model provider changes pricing mid-contract?
  - Inference path: dependency_rules.md 'External Dependency Management' → pricing changes; structure_spec.md 'Golden Relationships' → Cost budget ↔ Model selection
  - Verification criteria: PASS if cost monitoring detects anomalies and alerts before overrun. FAIL if not detected until billing cycle

- **CQ-XE07** [P3] What happens when multiple agents produce contradictory outputs?
  - Inference path: logic_rules.md 'Agentic Systems Logic' → termination conditions; structure_spec.md 'Agent Architecture Structure' → Multi-Agent Execution profile
  - Verification criteria: PASS if conflict resolution mechanism exists (orchestrator, voting, confidence). FAIL if no mechanism

---

## Related Documents
- domain_scope.md — the upper-level definition of the 8 sub-areas and cross-cutting concerns these questions cover
- logic_rules.md — inference logic for all 10 question categories (CQ-M through CQ-XE)
- structure_spec.md — structural specifications for CQ-R (knowledge, RAG), CQ-A (agent architecture), CQ-E (evaluation), CQ-S (safety), CQ-X (golden relationships, thresholds)
- dependency_rules.md — inter-area dependencies for CQ-X (direction rules, feedback loops), CQ-XE (external dependency failures), CQ-D (adaptation dependencies)
- concepts.md — definitions of terms used throughout these competency questions
