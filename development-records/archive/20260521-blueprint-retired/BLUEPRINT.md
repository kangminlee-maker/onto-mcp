# Onto — System Blueprint

> **Authoring Standards**
>
> 1. **Audience**: Non-specialists (not developers or product developers).
>    With this document and an LLM alone, it must be possible to rebuild the **review** process
>    and produce the same verification results as onto.
>    Non-review processes (reconstruct, evolve, learn, govern) are described at surface level only.
>
> 2. **Tense**: Describes only the current state. No past history (migrations, renames, deprecated models).
>
> 3. **Implementation status markers** — required on every feature and artifact:
>    - ✅ Implemented — code exists and is executable
>    - 📐 Design complete — design document finalized, no code yet
>    - 🔲 Not yet implemented — direction decided only
>
> 4. **Future direction**: Only decided items. No "under consideration" or "exploring."
>    Items with a decided direction but no implementation use 🔲 with a reference document.
>
> 5. **Terminology**: Uses canonical labels from `.onto/authority/core-lexicon.yaml`.
>    Legacy terms are mapped once at first mention and not used thereafter.
>
> 6. **Authority relationship**: This document is a derived re-description of primary sources.
>    When conflicts arise, the primary sources take precedence:
>    - Concepts: `.onto/authority/core-lexicon.yaml`
>    - Principles: `.onto/principles/*.md`
>    - Contracts: `.onto/processes/{feature}/*.md`
>    - Operations: `process.md`
>
> 7. **Update rule**: When a primary source changes, this document must be updated accordingly.
>    All updates must follow these authoring standards.
>
> 8. **Scope and self-sufficiency**: This document's reconstruction depth is centered on **review**.
>    The review process (§4.1, §7, §8) is described at reconstruction depth — enough to rebuild with an LLM.
>    Reconstruct and other processes are described at **surface level** (command, input, output, flow summary) — enough to understand what they do, not enough to rebuild from scratch.
>    For full reconstruction of non-review processes, consult the primary sources listed in standard 6.

> **Status and Reliance**
>
> This document is a **derived overview**, not a canonical authority.
> It re-describes primary sources for a non-specialist audience.
> When this document and a primary source disagree, the primary source wins — always.
>
> | Section | Reliance level | Primary source |
> |---|---|---|
> | §3 Review Lenses | Derived | `.onto/authority/core-lens-registry.yaml`, `.onto/roles/*.md` |
> | §4.1 Review flow | Derived | `.onto/processes/review/productized-live-path.md` |
> | §4.3 Reconstruct flow | Surface summary | `.onto/processes/reconstruct.md` |
> | §5 Domain System | Derived | `process.md` Domain Documents section |
> | §6 Learning System | Derived | `learning-rules.md` |
> | §7 Execution Profile | Derived | `process.md` Agent Teams Execution section |
> | §8 Review Runtime | Derived | `package.json`, `src/core-runtime/cli/*.ts` |
> | §10 Implementation Status | Snapshot | May lag behind code changes |

---

## 1. System Identity

### What It Is

onto is an **MCP-native ontology runtime** with a TypeScript core and host/provider adapters:

1. **MCP tool surface** ✅ — model-independent entrypoints that hosts can call as tools
2. **TypeScript CLI/runtime** ✅ — invoked as `npm run review:*` or as an installed CLI
3. **Host adapters** ✅ — Codex, Claude, and direct provider execution surfaces that preserve the same review contract

The host environment is detected automatically via env signals. Provider execution is selected through the canonical `llm` switcher in `.onto/config.yml`.

**Five activities** (`.onto/authority/core-lexicon.yaml#activity_enum`): `review`, `evolve`, `reconstruct`, `learn`, `govern`. Two are user-facing core capabilities below; the remaining three (evolve, learn, govern) are described at surface level in §4.4–§4.6.

Two core capabilities:

1. **Verification (review)** ✅: 9 independent review lenses inspect a scope-defined target, controlled lens deliberation resolves conflicts, then synthesize writes the final review result
2. **Reconstruct** ✅: Incrementally constructs ontologies (structured domain knowledge representations) from analysis targets using integral exploration. CLI 4-step bounded path: `start → explore → complete → confirm`

### Runtime And Model Switcher

onto separates orchestration from model access:

| Layer | Purpose | Active surface |
|---|---|---|
| **Review orchestration** | interpret, bind, dispatch lenses, run deliberation, synthesize | `review:` block |
| **Model access** | choose auth rail, provider, model, effort, optional base URL | `llm:` block |

The model switcher has three auth rails and four provider names:

| Auth rail | Providers | Runtime path |
|---|---|---|
| `oauth` | `openai` | Codex CLI subprocess |
| `api_key` | `openai`, `anthropic`, `grok` | direct provider API |
| `local` | `lmstudio` | local OpenAI-compatible endpoint |

### Host capability matrix

| Host | Team transport | Subprocess transport | Direct provider transport |
|---|---|---|---|
| `claude` | Claude Agent Teams when enabled | Codex subprocess when configured | available through `llm` |
| `codex` | unavailable | Codex subprocess | available through `llm` |
| `ts` | unavailable | optional Codex subprocess | available through `llm` |

### Why It Exists

Verifying from a single perspective misses problems in certain dimensions. Something logically consistent may be unqueryable in practice; something structurally complete may break when a new domain is added; something technically correct may have drifted from its original purpose.

onto addresses this with **9 review lenses** that each evaluate independently from a unique verification dimension, a **controlled deliberation stage** that converges conflicting lens positions, and a **synthesize stage** that integrates the resolved result.

### Core Design Principles

| Principle | Meaning | Without This |
|---|---|---|
| **Multi-perspective independent verification** | 9 lenses judge independently without knowing each other's results | Anchoring bias from being influenced by prior opinions |
| **Purpose alignment verification** | axiology reinterprets findings from the perspective of purpose and values | Results that meet criteria but diverge from original purpose |
| **Context-isolated reasoning** | Each lens runs in its own isolated context (ContextIsolatedReasoningUnit) | Main context saturation; lenses copy each other's drift |
| **Domain-independent design** | Verification dimensions (logic, structure, dependency...) apply regardless of domain | A separate system would be needed for each domain |
| **Learning accumulation** | Lenses record learnings from each execution and use them in subsequent ones | Repeating the same mistakes or losing previous context |

---

## 2. Canonical Concepts

Terms used throughout this document. All definitions follow `.onto/authority/core-lexicon.yaml`.

| Term | Definition |
|---|---|
| **review lens** | An independent review perspective that produces its own finding before synthesis. The canonical lens set is defined in `.onto/authority/core-lens-registry.yaml` |
| **synthesize** | The non-lens stage that integrates lens findings into a final review result. Not a lens itself |
| **InvocationInterpretation** | LLM-owned phase that interprets natural-language user input into entrypoint, target candidates, intent, and ambiguity |
| **InvocationBinding** | Runtime-owned deterministic phase that binds interpreted input into canonical requests and concrete refs |
| **ReviewRecord** | Canonical output of review; structured lineage record consumed by later learning/governance |
| **ContextIsolatedReasoningUnit** | A reasoning unit that does not share main-context state, consumes contract-bounded input, and produces contract-bounded output independently. Typical realizations: Agent Teams teammate, subagent, MCP-isolated LLM, external model worker |
| **ControlledLensDeliberation** | Bounded convergence process where lens outputs are re-evaluated by participating lenses before synthesize |
| **TopologyShape** | Internal review dispatch classification derived from `review:` axes and env signals |
| **OntoReviewConfig** | Active review config block in `.onto/config.yml`: teamlead / subagent / max_concurrent_lenses / lens_deliberation |
| **LensSelectionPlan** | Interpretation-owned plan that recommends full/core-axis review and the lens set to execute |
| **DomainFinalSelection** | Final domain value after explicit token parsing and user confirmation |
| **DeterministicStateEnforcer** | Runtime state machine that deterministically enforces review process state transitions. States and edges defined in `.onto/authority/core-lexicon.yaml` 📐 |
| **domain document** | Documents defining verification criteria for a specific domain. Types defined in `process.md` Domain Documents table. Referenced by lenses during judgment |
| **learning** | Lessons lenses discover during review/query. Tagged with axis (methodology/domain) and purpose type |
| **seed** | LLM-generated draft domain documents in `~/.onto/drafts/`. Contains SEED markers. Not used as verification standards |
| **established** | Domain documents in `~/.onto/domains/` with zero SEED markers. Used as verification standards |

Earlier prototype terminology is archived under `development-records/archive/` and does not define the active runtime vocabulary.

---

## 3. Review Lenses

### 3.1 The 9 Lenses

Each lens has a unique verification dimension and evaluates the same target independently.

#### logic — Logical Consistency Verifier

**Verification target**: Contradictions between definitions, type conflicts, constraint clashes

**Procedure**:
1. Extract all explicit and implicit axioms
2. Verify logical compatibility between axiom pairs
3. Confirm type hierarchy consistency
4. Check whether constraints conflict with each other

**Domain document**: `logic_rules.md`

---

#### structure — Structural Completeness Verifier

**Verification target**: Isolated elements, broken paths, missing relations, unreachable nodes

**Procedure**:
1. Construct all elements and relations as a graph
2. Detect isolated nodes with no connections
3. Confirm both ends of each relation are defined
4. Path completeness verification

**Domain document**: `structure_spec.md`

---

#### dependency — Dependency Integrity Verifier

**Verification target**: Circular dependencies, reverse dependencies, diamond dependencies

**Procedure**:
1. Construct all dependency relations as a directed graph
2. Detect circular references
3. Check for hierarchy direction violations
4. Diamond dependency analysis

**Domain document**: `dependency_rules.md`

---

#### semantics — Semantic Accuracy Verifier

**Verification target**: Misalignment between names and actual meanings, synonyms, homonyms

**Procedure**:
1. Compare all terms' names against their definitions
2. Detect synonym candidates (similar definitions, different names)
3. Detect homonym candidates (same name, different definitions)
4. Verify mapping against standard terminology

**Domain document**: `concepts.md` (accumulable)

---

#### pragmatics — Pragmatic Fitness Verifier

**Verification target**: Whether queries are actually possible, whether competency questions can be answered

**Procedure**:
1. Load the domain's competency question list
2. Verify whether each question can be answered with the current structure
3. Identify missing elements for unanswerable questions
4. Verify whether query paths are practical

**Domain document**: `competency_qs.md` (accumulable)

---

#### evolution — Evolution Fitness Verifier

**Verification target**: Whether existing structure breaks when adding new data, domains, or requirements

**Procedure**:
1. Load extension scenarios
2. Simulate accommodation without modifying existing structure
3. Estimate impact scope and ripple effects
4. Classify critical cases where existing structure must be destroyed

**Domain document**: `extension_cases.md`

---

#### coverage — Domain Coverage Verifier

**Verification target**: Missing subdomains, bias toward certain areas, gaps compared to standards

**Procedure**:
1. Load domain scope definition
2. Verify coverage of all areas in scope
3. Analyze bias in element counts by area
4. Detect gaps compared to domain standards

**Domain document**: `domain_scope.md` (scope-defining — this lens is ineffective without it)

---

#### conciseness — Conciseness Verifier

**Verification target**: Duplicate definitions, over-specification, unnecessary distinctions

**Procedure**:
1. Detect identical or similar concepts defined redundantly
2. Detect re-declaration of constraints already guaranteed by parents
3. Detect subclassifications that make no actual difference
4. Detect unnecessary intermediate hierarchies

**Domain document**: `conciseness_rules.md`

---

#### axiology — Purpose and Value Alignment Verifier

**Verification target**: Purpose drift, value conflicts, mission misalignment

**Procedure**:
1. Independently assess whether the target serves its declared purpose
2. Detect where detailed correctness has drifted from the original intent
3. Surface value conflicts, ethical concerns, and stakeholder impact
4. Present new perspectives that other lenses' dimensions do not cover

**Domain document**: None. Maintains a meta-perspective independent of domain.

**Special role**: axiology is the only lens that may propose new perspectives. synthesize must not invent new perspectives.

---

### 3.2 Synthesize Stage (synthesize)

synthesize has a fundamentally different role from the 9 lenses.

**Responsibilities**:
1. Classify lens findings into consensus / conditional consensus / disagreement / overlooked premises
2. Verify the logical rationale of consensus even for unanimous items
3. Present immediate actions and recommendations
4. Produce the final review result

**Key constraints**:
- Does not invent new independent perspectives (that is axiology's role)
- Preserves and positions perspectives that axiology proposed
- Is not a lens — it integrates, not verifies

### 3.3 Verification Dimension Coverage

| Dimension | Question | Covering Lenses |
|---|---|---|
| Formal consistency | No contradictions between definitions? | logic, dependency |
| Semantic accuracy | Each concept accurately represents its target? | semantics |
| Structural completeness | All internal connections exist without gaps? | structure |
| Domain coverage | All relevant concepts represented? | coverage |
| Minimality | No unnecessary elements? | conciseness |
| Pragmatic fitness | Serves the actual use purpose? | pragmatics |
| Evolution adaptability | Can adapt to changes? | evolution |
| Purpose alignment | Serves the higher purpose without drift? | axiology |

---

## 4. Processes

### 4.1 Review ✅

**Command**: `/onto:review {target}`
**Input**: Scope-defined documents, code, design proposals
**Output**: Final review report + ReviewRecord (structured artifact)

#### Canonical Live Path

```
user request
-> InvocationInterpretation (LLM interprets intent, target, domain)
-> User confirmation / selection
-> InvocationBinding (runtime binds to concrete refs)
-> Execution preparation artifacts
-> 9 lenses execute independently
-> synthesize integrates findings
-> Human-readable final output
-> ReviewRecord (primary artifact)
```

#### Step Details

**Step 1 — InvocationInterpretation** ✅: LLM interprets the user's natural-language request to determine entrypoint, target scope candidates, intent, domain recommendation, LensSelectionPlan (full/core-axis), and any ambiguity.
Output: `interpretation.yaml`

**Step 2 — User confirmation** ✅: If needed, the user confirms domain selection (DomainFinalSelection), full/core-axis mode, and any overrides. This is the point where the user exercises final authority between semantic recommendation and deterministic binding.

**Step 3 — InvocationBinding** ✅: Runtime deterministically binds the interpretation to concrete values: resolved target scope, final domain, execution realization, host runtime, review mode, lens set, session root, and all artifact paths.
Output: `binding.yaml`

**Step 4 — Execution preparation** ✅: The following artifacts are materialized:
- `session-metadata.yaml` — deterministic execution metadata
- `execution-preparation/materialized-input.md` — execution-friendly materialization of the review target (the single authoritative basis lenses read)
- `execution-preparation/context-candidates/` — candidate context set for lenses
- `execution-plan.yaml` — per-lens output seats, boundary policies
- `prompt-packets/` — per-lens and synthesize handoff prompts (produced by `review:materialize-prompt-packets`)

**Step 5 — 9 lenses execute independently** ✅: Each lens runs as a ContextIsolatedReasoningUnit. In Round 1, no lens sees another's results. Each saves its finding as a file in the session directory.

**Step 6 — synthesize** ✅: Reads all lens result files. Classifies into consensus / conditional consensus / disagreement / overlooked premises. Produces `synthesis.md`. Producer: the synthesize execution unit (not a lens — dispatched by `review:run-prompt-execution` after all lenses complete).

**Step 7 — Final output** ✅: Human-readable `final-output.md` rendered from synthesis. Producer: `review:render-final-output`.

**Step 8 — ReviewRecord** ✅: `review-record.yaml` assembled as the canonical primary artifact by `review:finalize-session`. This is what later learn/govern processes will consume. Assembled last because it aggregates all preceding artifacts including the final output.

#### Core Rules

- **File-based relay**: Lens results are saved as files and only the path is reported. The team lead's context does not carry per-lens detailed reasoning.
- **Even unanimity is verified**: The logical basis for consensus is separately confirmed.
- **Team lead does not intervene in content**: Relays results as-is without modification or summary.
- **Deliberation is conditional**: Only triggered when synthesize determines contested points exist. Available only in `agent-teams` + `claude` profile. In other profiles, contested points are reported as-is in the disagreement section. When deliberation occurs, its output is saved to `deliberation.md` in the session directory.

#### Full vs Light Review

Review mode is determined during InvocationInterpretation (LensSelectionPlan) and confirmed by the user.

| Mode | Lens set | When to use |
|---|---|---|
| **full** | All lenses defined in `full_review_lens_ids` (canonical set in `.onto/authority/core-lens-registry.yaml`) | Default. Comprehensive multi-perspective verification |
| **core-axis** | Subset defined in `core_axis_lens_ids` (same registry) — 6 cost-constrained Pareto-optimal lenses (axiology / coverage / evolution / logic / semantics / structure) | Default for small targets. Empirically selected via v5 benchmark (243 valid full-session pool + 24 consensus depth items) under coverage × depth × items-lost × cost trade-off. Token cost is ~67% of full. (수치 근거: `development-records/benchmark/20260419-lens-contribution-analysis.md` §6.6-6.7) |

Both modes follow the same canonical live path. The only difference is which lenses execute in Step 5. axiology is always included regardless of mode (`always_include_lens_ids` in the registry).

---

### 4.2 Individual Query ✅

**Command**: `/onto:ask-{dimension} {question}` (e.g., `/onto:ask-logic Is there a contradiction?`)
**Input**: A question for a specific verification dimension
**Output**: Answer from that single lens + learning record

Directly asks a single-dimension specialist. The lens loads its role definition + learnings + domain documents before answering.

Available dimensions: `logic`, `structure`, `dependency`, `semantics`, `pragmatics`, `evolution`, `coverage`, `conciseness`, `axiology`

---

### 4.3 Ontology Reconstruct ✅ (prompt-only methodology + ✅ TS CLI bounded path)

**Command**: `/onto:reconstruct {path|URL}`
**Input**: Analysis target (code, spreadsheets, databases, documents)
**Output**: `raw.yml` — ontology extracted from the source; `ontology-draft.md` — Principal-facing review draft

The methodology is executed via the prompt-backed reference path. The CLI surface is a **4-step bounded path** (`start → explore → complete → confirm`) implemented in `src/core-runtime/evolve/commands/reconstruct.ts`, mirroring review's 3-step bounded path. TS runtime productization of the full Phase 0–4 methodology is 🔲 not yet implemented.

| Subcommand | Action |
|---|---|
| `start <source> <intent>` | Initialize a reconstruct session |
| `explore --session-id <id>` | Run one exploration invocation (bounded; repeatable) |
| `complete --session-id <id>` | Finalize ontology-draft.md + set `principal_review_status: requested` |
| `confirm --session-id <id> --verdict passed\|rejected` | Record Principal verification result (W-B-07, §1.4 3-axis 완결) |

Reconstruct uses an **integral exploration** structure because, unlike review, the scope is undefined.

#### Flow

```
Phase 0: Schema Negotiation — decide the ontology framework with the user
  4 options: Action-Centric / Knowledge Graph / Domain-Driven / Custom
  → Save schema.yml

Phase 0.5: Context Gathering — project scan + user questions
  → Save context_brief.yml

Phase 1: Integral Exploration Loop (2 Stages × max 5 rounds each)
  Stage 1 — Structure (see fact_type table below for Stage 1 types)
    Round 0: Explorer surveys overall structure (module list = coverage denominator)
    Round N:
      1. Explorer reports deltas (domain facts with structured_data)
      2. Lenses: attach labels (ontology types) + suggest epsilons (next directions)
      3. Coordinator: convert labels to patches → update wip.yml
      4. Coordinator: integrate epsilons, judge convergence
      5. Explorer: explore in integrated direction → new deltas
    Termination: (all modules explored ≥1) AND (new facts = 0)

  Stage 2 — Behavior (see fact_type table below for Stage 2 types)
    References Stage 1 confirmed Entities. Same integral loop.

Phase 2: Finalization — coordinator review, wip.yml → raw.yml
Phase 3: User Confirmation — certainty distribution, coverage, decision items
Phase 4: Storage — save raw.yml
Phase 5: Learning Storage
```

#### Key Concepts

**Explorer**: An agent that directly traverses the source and reports domain facts (deltas) without ontological interpretation. "The Payment class has status, amount, createdAt fields" (correct) vs. "Payment is an Aggregate Root" (incorrect — that is a lens's job). The reason: if the Explorer also interprets, lenses' independent judgment gets anchored.

**Delta**: A domain fact unit the Explorer reports. Contains `fact_type` and optional `structured_data` (fields specific to each type, e.g., name and fields for entity).

**Epsilon**: A "next direction to explore" suggested by lenses based on gaps found in deltas.

**Label**: An ontology type assigned by lenses to a delta (e.g., "this is an Entity").

**Patch**: The unit of change where the coordinator converts labels into ontology elements and applies them to wip.yml.

**fact_type** (10 types), partitioned by Stage. Canonical SSOT: `.onto/authority/core-lexicon.yaml#fact_type` (v0.10.0+, R-31 정렬). Stage 분할 요약:

| Stage 1 — Structure | Stage 2 — Behavior |
|---|---|
| `entity` | `state_transition` |
| `enum` | `command` |
| `property` | `query` |
| `relation` | `policy_constant` |
| `code_mapping` | `flow` |

값 추가·rename·세분화는 lexicon term 갱신이 선행. 본 표는 lexicon `stage_partition` 을 시각화한 사본.

**Certainty classification** (2-stage adjudication):

Stage 1 — Explorer assigns:
- `observed` — directly confirmed in source
- `pending` — cannot be confirmed from source alone

Stage 2 — Lenses refine `pending` into:
- `rationale-absent` — implementation exists but rationale does not
- `inferred` — reasonable inference, not directly verifiable
- `ambiguous` — multiple equally valid interpretations
- `not-in-source` — cannot be determined from this source

Each certainty level triggers different actions in Phase 3 (user confirmation).

---

### 4.4 Evolve 📐

**Command**: `/onto:evolve {goal}`
**Input**: 설계 목표 (자연어) + 설계 대상 + 선택적으로 ontology, 학습, 도메인 문서
**Output**: 설계 문서 (Specification)

온톨로지를 기반으로 기존 설계 대상(design target)에 새 영역을 추가하는 evolve 활동.
brownfield 전용 — 기존 대상의 constraint를 인식하고 그 안에서 설계.
6-Phase inquiry로 주체자의 인지 한계를 보완하여 constraint-aware한 설계를 도출.
산출물 검증은 `/onto:review`로 연결.

> Methodology terms (`design_target`, `design_area`, `design_constraint`, `design_gap`) retain the `design_` prefix as lexicon-stable terminology — the **activity name** changed from `design` to `evolve`, but the methodology vocabulary is preserved.

code-product(experience/interface) 런타임 경로 구현 완료.
methodology(process) 런타임 경로 구현 예정.

---

### 4.5 Transform ✅

**Command**: `/onto:transform {file}`
**Input**: `raw.yml`
**Output**: Ontology in chosen format (Markdown, Mermaid, YAML, JSON-LD, OWL/RDF, Hybrid)

---

### 4.5 Onboard ✅

**Command**: `/onto:onboard`
**Output**: onto environment configured for the project

Sets up `.onto/` directories, domain declaration in `.onto/config.yml`, suggests domain document installation, optional Codex setup.

---

### 4.6 Learning Promotion ✅

**Command**: `/onto:promote` (slash) or `onto promote` (CLI subcommand)
**Input**: Project-level learnings (plus global learnings for curation passes)
**Output**: Learnings promoted to global-level + retired candidates + health snapshot

Promotes learnings valid across projects. Split into two phases:

- **Phase A (analyze)**: `onto promote` collects candidates, runs a 3-agent panel review (criteria 1~5), runs cross-agent dedup discovery (criterion 6, LLM-driven with Jaccard pre-filter + union-find + same-principle test), runs judgment-audit re-verification, identifies retirement candidates, and writes a `PromoteReport` as the Phase A seat. No mutation.
- **Phase B (apply)**: `onto promote --apply <session>` reads the operator-approved decisions from the report, mutates the global learning files with line-level file locking (cross-agent dedup writes through a best-effort advisory lock), and persists an `ApplyExecutionState` ledger with resume support.

Related CLI subcommands:
- `onto reclassify-insights` — analyze phase for `[insight]`-tagged learnings
- `onto reclassify-insights --apply <report>` — rewrite `[insight]` role tags in place (idempotent via `line_number` + `raw_line` anchor)
- `onto migrate-session-roots` — one-shot legacy session layout migration

All destructive operations require user approval via the decisions file. The pipeline fails-closed on partial-apply detection (SYN-CC1 contract — see `src/core-runtime/learning/promote/promote-executor.ts`).

---

### 4.7 Domain Creation ✅

**Command**: `/onto:create-domain {name} {description}`
**Output**: 8 seed domain documents in `~/.onto/drafts/{name}/`

LLM generates all 8 document types. Low-confidence content is marked with SEED markers. Seeds are never loaded as verification standards.

---

### 4.8 Domain Feedback ✅

**Command**: `/onto:feedback {domain}`
**Output**: Updated seed documents with learnings incorporated

Feeds `[domain/{domain}]` learnings back into seed documents. User approval required for all changes.

---

### 4.9 Domain Promotion ✅

**Command**: `/onto:promote-domain {domain}`
**Output**: Domain moved from `~/.onto/drafts/` to `~/.onto/domains/`

Pre-checks zero SEED markers. After promotion, the domain becomes an established verification standard.

---

### 4.10 Backup ✅

**Command**: `/onto:backup` or `/onto:backup "reason"`
**Output**: Timestamped snapshot at `~/.onto/_backups/{backup-id}/`

---

### 4.11 Restore ✅

**Command**: `/onto:restore` (list) or `/onto:restore {backup-id}`
**Output**: Restored data + safety backup of pre-restore state

---

### 4.12 Health Dashboard ✅

**Command**: `/onto:health`
**Output**: Learning pool health metrics (axis distribution, purpose type distribution, judgment ratio, duplicate candidates)

---

## 5. Domain System

### 5.1 Domain Selection

Domains use a **per-session selection** model. Each process execution selects a single session domain.

**Project domains** and review execution axes are declared in `.onto/config.yml`. Canonical surface (Review UX Redesign, 2026-04-21):

```yaml
domains:
  - software-engineering
  - ontology
output_language: ko              # en (default) | ko | etc.
review:
  teamlead:
    model: main
  subagent:
    provider: codex              # main-native | codex
    model_id: gpt-5.4
    effort: high
  # max_concurrent_lenses: 6
  # lens_deliberation: controlled-lens-deliberation
```

**Output language priority**: config.yml `output_language` > CLAUDE.md language directives. If absent, defaults to `en`.

**Selection methods**:

| Method | Canonical | Alternate token | Behavior |
|---|---|---|---|
| Explicit | `--domain {name}` | `@{domain}` | Non-interactive, uses specified domain |
| No-domain | `--no-domain` | `@-` | Non-interactive, no domain rules applied |
| Interactive | (omit) | (omit) | Analyze target → suggest domain → user confirms |

**Why canonical flags**: positional `@{domain}` conflicts with Claude Code's `@filename` mention syntax. `--domain` / `--no-domain` removes ambiguity. Session artifacts may still record `@{name}` / `@-` as the internal token. `--domain` and `--no-domain` are mutually exclusive (parser-layer fail-fast).

**No-domain mode**: Verifies using lens default methodology only. Learning tags: `[methodology]` only.

### 5.2 Domain Documents (8 Types)

Each domain has up to 8 reference documents. Each lens references the document corresponding to its dimension.

| Document | Used by Lens | Type | Description |
|---|---|---|---|
| `domain_scope.md` | coverage | Scope-defining | Domain area definition. Lens is ineffective without this |
| `concepts.md` | semantics | Accumulable | Core concept definitions |
| `competency_qs.md` | pragmatics | Accumulable | Competency question list |
| `logic_rules.md` | logic | Rule-defining | Domain-specific logic rules |
| `structure_spec.md` | structure | Rule-defining | Structural specifications |
| `dependency_rules.md` | dependency | Rule-defining | Dependency rules |
| `extension_cases.md` | evolution | Rule-defining | Extension scenarios |
| `conciseness_rules.md` | conciseness | Rule-defining | Conciseness criteria |

axiology has no dedicated domain document. It uses system purpose/principles and session context.

### 5.3 Agent Re-evaluation on Domain Expansion

The 9 lenses are domain-independent by default. However, certain domain types require re-evaluation:

| Condition | Reason | Action |
|---|---|---|
| Domains that classify humans/groups (medical, education, law, HR) | Ethics/axiology verification weight increases | Ensure axiology is sufficiently informed |
| Financial/administrative domains | Social ontology weight increases — institutional constructs are central | Adjust semantics existence-type verification weight |

### 5.4 Cross-Domain Targets

When a target spans multiple domains, run a **separate review for each relevant domain**. Each execution is an independent session: results are not cross-referenced, and learnings are stored separately.

**Storage path**: `~/.onto/domains/{domain}/` (established) or `~/.onto/drafts/{domain}/` (seed)

**Protection principle**: Domain documents are never auto-modified by lenses. All changes require explicit user approval.

### 5.5 Seed Lifecycle

```
create-domain → seed in drafts/
→ review (seeds can be review targets)
→ feedback (learnings incorporated)
→ (repeat review + feedback)
→ promote-domain (all SEED markers removed → moves to domains/)
→ established (used as verification standards)
```

### 5.6 Available Domains

| Domain | Description |
|---|---|
| `software-engineering` | Code quality, architecture, type safety, testing strategy |
| `llm-native-development` | LLM-friendly structure, ontology-as-code |
| `accounting` | Double-entry bookkeeping, K-IFRS, tax adjustments, auditing |
| `finance` | Financial statements, XBRL, revenue recognition, financial instruments |
| `business` | Business strategy, marketing, financial management, innovation |
| `market-intelligence` | Market analysis, competitive intelligence, risk assessment |
| `ontology` | Ontology design, OWL/RDFS/SKOS, classification consistency |
| `visual-design` | Typography, color, layout, motion, branding, accessibility |
| `ui-design` | Navigation, forms, feedback, responsive design, WAI-ARIA |

---

## 6. Learning System

### 6.1 Storage Model (2-Path + Axis Tags)

**Product Locality Principle**: 학습은 항상 product (`{product}/.onto/learnings/`) 에 먼저 기록된다. 글로벌 설치만 존재하는 경우에도 동일하다. 글로벌 학습(`~/.onto/learnings/`)은 `onto promote`를 통해 product 학습에서 승격된다. 전체 원칙은 `.onto/principles/product-locality-principle.md` 참조.

| Path | Scope | Contents |
|---|---|---|
| `{project}/.onto/learnings/{lens-id}.md` | Project | 축적(creation) 시작점. 소비(consumption) 대상 아님 |
| `~/.onto/learnings/{lens-id}.md` | Global | `onto promote`로 승격된 학습. 소비(consumption) 유일 소스 |
| `~/.onto/communication/common.md` | Global | User communication preferences |

**Entry format**: `- [type] [axis tag] [purpose type] content (source: ...) [impact:severity]`

### 6.2 Tag System

**Type tags**: `[fact]` (objective) or `[judgment]` (value judgment, subject to re-verification)

**Axis tags** (multiple allowed):
- `[methodology]` — domain-independent verification technique
- `[domain/{name}]` — valid in context of a specific domain

Axis tags are determined by a mandatory 2+1 stage test before storage:
1. **Sanity check**: Does the principle hold after removing domain-specific terms? No → domain-only
2. **Applicability**: Does applying this presuppose domain-specific conditions? Yes → dual-tag
3. **Counterexample**: Can you identify a domain where this produces incorrect results? Yes → dual-tag

All stages pass → `[methodology]` only.

**Purpose type tags** (exactly one per learning):
- `[guardrail]` — failure-derived prohibition (3 required elements: situation, result, corrective action)
- `[foundation]` — prerequisite knowledge for other learnings
- `[convention]` — terminology/procedure agreement
- `[insight]` — operational default for learnings that do not qualify as the above 3. Note: `insight` was removed from the canonical `learning_role` enum in `core-lexicon.yaml` to resolve a rigidity violation; it is retained as an operational tag in `learning-rules.md`

**Impact**: `[impact:high]` or `[impact:normal]` — set once at creation, immutable.

### 6.3 Consumption Rules

1. `[methodology]` → always apply
2. `[domain/{session_domain}]` → always apply
3. `[domain/{other}]` only → review then judge
4. No tags → treat as `[methodology]`
5. Dual-tag `[methodology]` + `[domain/X]` → always apply (domain tag is provenance)
6. Purpose type tags do not affect consumption filtering

### 6.4 Creation-Time Verification Gate

Before saving any learning, a mandatory tag check runs:

**Required**: at least one axis tag + exactly one purpose type + exactly one impact tag. For `[guardrail]`: presence of situation/result/corrective action keywords.

**On failure**: 1 retry (re-apply determination flow). If still failing, save with warning marker `<!-- tag-incomplete -->` — corrected at next promote.

### 6.5 Consumption Feedback

After applying learnings during execution, lenses record:
- Which learnings were applied and whether they revealed findings that would have been missed otherwise
- If a learning is found invalid/harmful, an event marker is attached
- Event markers accumulate; 2+ markers surface the learning as a retirement candidate during promote

### 6.6 User Approval Tiers

All learning modifications follow a tiered approval model:

| Activity | User Involvement |
|---|---|
| Information addition (metadata, markers) | Automatic + post-report |
| Information change (tag modification, consolidation) | Summary report + batch approval |
| Information deletion (dedup, retirement) | Per-item approval |
| Observation (diagnostics, ratios) | Report viewing only |

---

## 7. Execution Profile

Lens execution is configured by **6 user-facing axes** (Review UX Redesign, P1 #152). Runtime derives one of 6 internal `TopologyShape` s and maps to the canonical `TopologyId` catalog. Legacy 2-axis model (`execution_realization × host_runtime`) is a backward-compat layer.

> **Canonical key surface**: `.onto/processes/configuration.md` §4.5 "Review-specific" — `review:` axis block 의 전체 sub-key 정의 / 유효값 / 기본값 / 사용 예시 3개. 본 §7 은 그 key set 의 derived overview. Primary source 변경 시 본 섹션도 동기 (§"Update rule" per authoring standards).

### 7.1 The 6 Axes (Canonical as of 2026-04-21)

| Axis | What it decides | Values / domain |
|---|---|---|
| **teamlead.model** | Which model runs the orchestrator (teamlead) | `"main"` (host session) or `{provider, model_id, effort}` (explicit external) |
| **subagent.provider** | Which provider executes each lens | `main-native` / `codex` / `anthropic` / `openai` / `litellm` |
| **subagent.model_id** | Foreign provider's model identifier | provider-specific; required when `provider != main-native` |
| **subagent.effort** | Reasoning effort for the subagent | provider-specific (e.g. codex: `minimal`/`low`/`medium`/`high`/`xhigh`) |
| **max_concurrent_lenses** | Parallel dispatch cap | positive integer; provider default applies when omitted |
| **lens_deliberation** | Lens-to-lens deliberation semantic | `controlled-lens-deliberation` |

Runtime also consumes `agent_teams_available` (auto-detected from `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) when deriving the shape — user does not set this.

### 7.2 The 6 Topology Shapes

| Shape | Teamlead | Lens mechanism | Maps to TopologyId(s) |
|---|---|---|---|
| **main_native** | host main session | host native subagent | `cc-main-agent-subagent` (Claude) / `codex-main-subprocess` (Codex) |
| **main_foreign** | host main session | foreign provider | `cc-main-codex-subprocess` |
| **main-teams_native** | TeamCreate wrapping | Claude Agent tool | `cc-teams-agent-subagent` |
| **main-teams_foreign** | TeamCreate wrapping | foreign provider | `cc-teams-codex-subprocess` |
| **main-teams_deliberation** | TeamCreate wrapping | Agent-tool + controlled deliberation transport | `cc-teams-lens-agent-deliberation` |
| **ext-teamlead_native** | spawned subprocess | subprocess native | `codex-nested-subprocess` (PR-C pending) |

Design-integrity audit (6 shape × 7 pipeline step): `development-records/audit/20260421-shape-pipeline-audit.md`.

### 7.3 Legacy 2-axis model (backward-compat)

The legacy profile still resolves when the `review:` block is absent:

| Axis | What it decides | Values |
|---|---|---|
| **execution_realization** (deprecated) | Structural dispatch | `subagent` / `agent-teams` |
| **host_runtime** (deprecated) | Host environment | `codex` / `claude` |

Equivalences:
- `subagent + codex` ≡ `review.subagent.provider=codex` (shape: `main_foreign` under Claude host / `main_native` under Codex host)
- `agent-teams + claude` ≡ `review.subagent.provider=main-native` + teams env (shape: `main-teams_native`)

Migration guide: `docs/topology-migration-guide.md` §7.

### 7.4 Resolution Order (Canonical)

1. `config.review` present + valid → axis-first dispatch (shape → TopologyId).
2. Axis-first failure (validation / derivation / mapping) → P3 universal fallback to `main_native` shape.
3. `main_native` also unmappable → `no_host` fail-fast with environment diagnostic (6-option setup guide).

> **P9.1 note (2026-04-21)**: the legacy `execution_topology_priority` ladder that previously sat between (2) and (3) was retired. Axis-first + universal fallback are the only two paths; `no_host` is the single fail-fast.

`--codex` flag still routes to codex CLI path via `onto review` — this remains a backward-compat shortcut equivalent to `review.subagent.provider=codex`.

### 7.5 Parallel Execution

All profiles dispatch lenses in parallel with bounded concurrency. Default `max_concurrent_lenses` is `9` (all lenses concurrent). The Codex path uses a 1500ms stagger delay between successive lens dispatches to absorb thundering-herd and transient API rate-limit failures at this concurrency.

Override: `--max-concurrent-lenses` flag (or `review.max_concurrent_lenses` in the axis block).

### 7.6 Error Handling

| Category | Condition | Response |
|---|---|---|
| **Process-halting** | Target/definition read failure | Halt + inform user |
| **Process-halting-with-partial-result** | Irreplaceable role fails but intermediate results exist | Halt + deliver partial results with limitation disclosure |
| **Transient → retry** | API error, crash | Retry up to 2 times, then graceful degradation |
| **Graceful degradation** | Partial lens failure, missing files | Exclude affected lens, adjust consensus denominator |

---

## 8. Review Runtime (TypeScript Bounded Path) ✅

The review process has a TypeScript core runtime that deterministically manages artifacts and state transitions.

### 8.1 CLI Commands

**Combined entrypoint** (preferred):
```bash
npm run review:invoke -- --target {path} --domain {domain}
```

**Decomposed steps** (for debugging or integration):

| Step | Command | Produces |
|---|---|---|
| Start session | `npm run review:start-session -- ...` | Session directory + metadata |
| Write interpretation | `npm run review:write-interpretation -- ...` | `interpretation.yaml` |
| Bootstrap binding | `npm run review:bootstrap-binding -- ...` | `binding.yaml` |
| Materialize preparation | `npm run review:materialize-execution-preparation -- ...` | Execution preparation artifacts |
| Materialize prompts | `npm run review:materialize-prompt-packets -- ...` | `prompt-packets/` |
| Run prompt execution | `npm run review:run-prompt-execution -- ...` | Lens results + `synthesis.md` + `execution-result.yaml` |
| Render final output | `npm run review:render-final-output -- ...` | `final-output.md` |
| Assemble record | `npm run review:finalize-session -- ...` | `review-record.yaml` |
| **Complete session** (wrapper) | `npm run review:complete-session -- ...` | Calls render-final-output + finalize-session in sequence |

### 8.2 Canonical Artifacts

| Artifact | Format | Role | Presence |
|---|---|---|---|
| `interpretation.yaml` | YAML | LLM interpretation output | Always |
| `binding.yaml` | YAML | Runtime-bound concrete values | Always |
| `session-metadata.yaml` | YAML | Deterministic execution metadata | Always |
| `execution-plan.yaml` | YAML | Per-lens output seats, boundaries | Always |
| `prompt-packets/*.md` | Markdown | Per-lens handoff prompts | Always |
| `round1/{lens-id}.md` | Markdown | Per-lens findings (human-readable) | Always |
| `synthesis.md` | Markdown | Synthesize stage output | Always |
| `deliberation.md` | Markdown | Deliberation exchange between contested lenses | Conditional — only when synthesize determines contested points exist and profile supports deliberation (`agent-teams` + `claude` only) |
| `final-output.md` | Markdown | Human-readable final review | Always |
| `execution-result.yaml` | YAML | Execution outcome metadata | Always |
| `review-record.yaml` | YAML | **Primary artifact** — canonical review record | Always |

### 8.3 DeterministicStateEnforcer 📐

A state machine design for the review process with 9 states and 12 edges:

- **Auto states** (3): Runtime executes deterministic steps automatically
- **Await states** (3): Runtime outputs dispatch instructions and waits for caller
- **Terminal states** (3): No outgoing transitions — session complete, failed, or cancelled

Design reference: `.onto/authority/core-lexicon.yaml` (state machine terms)

---

## 9. Data Layout

### 9.1 Plugin Code

```
onto/
├── .onto/authority/               # Canonical data (deployed)
│   ├── core-lexicon.yaml           # Concept SSOT (rank 1)
│   ├── core-lens-registry.yaml     # Lens config (runtime)
│   └── translation-reference.yaml  # Term translation (onboarding)
│
├── .onto/principles/       # Development governance (not deployed)
│   ├── ontology-as-code-guideline.md
│   ├── llm-native-development-guideline.md
│   ├── productization-charter.md
│   ├── llm-runtime-interface-principles.md
│   └── ontology-as-code-naming-charter.md
│
├── development-records/     # Development history (not deployed)
│
├── .onto/processes/               # Process definitions
│   └── review/              #   Review contracts and live path
├── .onto/roles/             # Lens role definitions (10) (Phase 3 layout)
│   ├── logic.md ... axiology.md
│   └── synthesize.md
├── .onto/commands/          # Command definitions (Phase 1 layout)
├── .onto/domains/           # Domain base documents (9 domains × 8 files) (Phase 2 layout)
├── explorers/               # Explorer profiles (build only)
├── golden/                  # Golden examples per schema
├── src/core-runtime/        # TypeScript runtime
├── scripts/                 # Shell utilities (review watcher, etc.)
├── process.md               # Operational procedures + mutable paths
├── learning-rules.md        # Learning storage rules (teammate reference)
├── package.json             # npm scripts + dependencies
├── tsconfig.json            # TypeScript configuration
├── CLAUDE.md                # Authority hierarchy table
├── AGENTS.md                # Agent quick-reference
├── BLUEPRINT.md             # This document
└── README.md                # User guide + installation
```

### 9.2 Runtime-Generated (per project)

```
{project}/.onto/
├── config.yml                      # Project domains + execution profile
├── review/{session-id}/            # Review session
│   ├── interpretation.yaml
│   ├── binding.yaml
│   ├── session-metadata.yaml
│   ├── execution-preparation/
│   ├── prompt-packets/
│   ├── round1/{lens-id}.md
│   ├── synthesis.md
│   ├── deliberation.md          # Conditional — only when deliberation occurs
│   ├── final-output.md
│   ├── execution-result.yaml
│   └── review-record.yaml
├── builds/{session-id}/            # Reconstruct session
│   ├── schema.yml, context_brief.yml
│   ├── round0~N/
│   └── raw.yml
└── learnings/{lens-id}.md          # Project-level learnings
```

### 9.3 Global Storage

Project Locality Principle: 글로벌 저장소는 프로젝트 간 공유 자산 보관용. 학습은 `onto promote`로만 도달.

```
~/.onto/
├── learnings/{lens-id}.md          # Promoted learnings (from project via onto promote)
├── communication/common.md         # Communication learnings
├── domains/{domain}/               # Established domain documents (8 files)
├── drafts/{domain}/                # Seed domain documents
└── _backups/{backup-id}/           # Backup snapshots
```

---

## 10. Implementation Status

| Feature | Status | Notes |
|---|---|---|
| **Review** — 9-lens + synthesize | ✅ | Full canonical live path |
| **Review** — TS bounded runtime | ✅ | `npm run review:invoke` and all decomposed steps |
| **Review** — Agent Teams mode | ✅ | Default on claude host |
| **Review** — Subagent fallback | ✅ | Auto on TeamCreate failure |
| **Review** — Codex mode | ✅ | `--codex` flag or config.yml |
| **Review** — DeterministicStateEnforcer | 📐 | 9 states, 12 edges designed. `.onto/authority/core-lexicon.yaml` |
| **Review** — ReviewRecord assembly | ✅ | `review:complete-session` |
| **Build** — integral exploration | ✅ | 2-stage structure |
| **Build** — TS bounded runtime | 🔲 | Prompt-only. Review-first strategy |
| **Individual Query** | ✅ | `/onto:ask-{dimension}` |
| **Domain system** — 8 doc types | ✅ | Established + seed lifecycle |
| **Domain system** — per-session selection | ✅ | config.yml + interactive flow |
| **Learning** — 2-path + axis tags | ✅ | Global + project paths |
| **Learning** — consumption feedback | ✅ | Event markers + retirement candidates |
| **Learn Phase 1/1.5** — tiered consumption loader | ✅ | `src/core-runtime/learning/loader.ts`. Triggers at >100 lines per lens, 3-tier priority + token budget |
| **Learn Phase 2** — extraction + feedback markers | ✅ | `src/core-runtime/learning/extractor.ts`, `feedback.ts` |
| **Learn Phase 3** — promote + retire pipeline | ✅ | `src/core-runtime/learning/promote/` (24 modules). Phase A (analyze) + Phase B (apply) split with resume support |
| **Learn Phase 3** — cross-agent dedup discovery (criterion 6) | ✅ | LLM-driven Jaccard pre-filter + union-find + same-principle test. `panel-reviewer.ts`. Cost-bounded (MAX_SHORTLISTS_PER_RUN=20) |
| **Learn Phase 3** — insight reclassifier apply path | ✅ | `insight-reclassifier.ts` apply phase. Idempotent via line_number + raw_line anchors. CLI: `onto reclassify-insights --apply` |
| **Learn Phase 3** — file-level lock for dedup apply | ✅ | Best-effort advisory `.lock` with PID-liveness stale reclaim. Non-spinning via Atomics.wait |
| **Learn entrypoint (CLI)** | ✅ | `onto promote`, `onto promote --apply`, `onto reclassify-insights`, `onto migrate-session-roots` |
| **Govern entrypoint** | 📐 | Reads learnings + ReviewRecords. Design: `.onto/principles/productization-charter.md` §12 |
| **Onboard / Promote slash command / Health** | ✅ | |
| **Domain creation / feedback / promotion** | ✅ | |
| **Backup / Restore** | ✅ | |

---

## 11. Future Direction

Decided items only. All below are confirmed in .onto/principles/ documents.

### 11.1 Learn and Govern Entrypoints

**Learn ✅ (Phase 1~3 implemented)** — The `learn` family reads the in-session learning files (plus the review/promote output trail) to extract, curate, promote, and retire learnings systematically. The full pipeline lives in `src/core-runtime/learning/` and exposes four CLI subcommands:

- `onto promote` — Phase 3 analyze (candidates + panel review + criterion 6 dedup + judgment audit + retirement scan)
- `onto promote --apply <session>` — Phase 3 apply (file-level mutations with resume support and fail-closed partial-apply detection)
- `onto reclassify-insights` — Phase 3 insight role reclassification (analyze + apply variants)
- `onto migrate-session-roots` — one-shot legacy session layout migration

**Govern 📐** — Reads accumulated learnings + ReviewRecords to propose structural governance actions. Downstream consumer of Learn output. Not yet implemented.

Reference: `.onto/principles/productization-charter.md` §12 Current Priority Order, `src/core-runtime/learning/promote/`

### 11.2 Review State Machine Completion 📐

The DeterministicStateEnforcer will replace the current coordinator pattern with a formal state machine. 9 states (3 auto, 3 await, 3 terminal), 12 edges. The state machine enforces transitions deterministically without semantic judgment.

Reference: `.onto/authority/core-lexicon.yaml` (auto_state, await_state, terminal_state terms)

### 11.3 Build Productization 🔲

Build will follow the same methodology as review: ontology-as-code authority → prompt-backed reference path → observation → bounded TS runtime replacement, one boundary at a time.

**Architecture design + adoption hypothesis**: `development-records/evolve/20260409-graphify-adoption-hypothesis.md` (v7) — onto build의 **Two-Layer Architecture canonical design document**. Part I은 Phase 0 architectural decisions 6건 (ARCH-L1L2 / ARCH-RAWFMT / ARCH-BOUNDARY / ARCH-PROMOTION / ARCH-CACHE-L / ARCH-MCP-L)을 포함하여 ground truth layer (precise reproduction)와 inference layer (evolution driver)의 분리·gated promotion 메커니즘을 정의. Part II는 graphify(safishamsi/graphify v3 @ 92b70ce5) 차용 평가를 layer 분류 하에서 재구성. Part III는 prior-finding crosswalk + review history. v6 대비 핵심 변화: 단일 raw.yml → `raw-ground-truth.yml` + `raw-inference.yml` 분리, 새 명령 `/onto:promote-inference` 및 `/onto:refine` 도입, BT-E5/BT-E6 layer split, BT-A1/A2/A3/A4 inference layer 1급 시민 승격.

Reference: `.onto/principles/productization-charter.md` §7, §12

### 11.4 Learning Phase 1 Tiered Loading ✅

Implemented in `src/core-runtime/learning/loader.ts`. When any lens exceeds 100 accumulated learnings, a 3-tier priority system activates:
- Tier 1 (unconditional): `[foundation]`, `[convention]`
- Tier 2 (purpose-based): `[guardrail]`
- Tier 3 (recency): `[insight]`

The loader also enforces a per-agent token budget (default 4000 tokens) and truncates lower-tier items when the budget is exhausted. Phase 1.5 adds source metadata preservation so Phase 2 (extractor) can attribute learnings back to their originating session.

Reference: `learning-rules.md` §Learning Lifecycle Phases, `src/core-runtime/learning/loader.ts`
