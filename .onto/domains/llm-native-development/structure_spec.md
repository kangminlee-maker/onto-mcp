---
version: 2
last_updated: "2026-03-30"
source: manual
status: established
---

# LLM-Native Development Domain — Structure Specification

## Project Required Files (Meta Files) (→Area 3)

| Role | Filename | Location | Description | Constraints |
|------|---------|----------|-------------|-------------|
| LLM Instruction File | Per project convention | Project root | Delivers project instructions to the LLM. Include only information without which work would fail | 300 lines or fewer |
| Structure Map | ARCHITECTURE.md or llms.txt | Project root | Structure map of the entire system. Directory structure, each directory's role, key file list | All top-level directories mentioned |
| Navigation Index | INDEX.md | 1 per directory | File list within the directory and a one-line description of each file. Source of truth for file existence | — |
| Human-Readable Guide | README.md | Each directory (optional) | Can be used instead of INDEX.md. Human-readability focused | When coexisting with INDEX.md, INDEX.md takes precedence |
| Feature Specification | spec.md | Feature directory | Feature specification before implementation. Includes requirements, architecture decisions, test strategy | Same directory as implementation files |

**Vendor-Specific LLM Instruction File Conventions (→Area 3):**

| LLM Ecosystem | Filename | Notes |
|--------------|---------|-------|
| Claude Code | CLAUDE.md | Can be placed at project root + per subdirectory |
| Cursor | .cursorrules | Project root |
| GitHub Copilot | .github/copilot-instructions.md | .github directory |
| Windsurf | .windsurfrules | Project root |
| General (AGENTS.md standard) | AGENTS.md | Managed by Linux Foundation, multi-agent support |

Select the filename matching the LLM ecosystem used by the project. When using multiple LLM ecosystems simultaneously, instruction files for each ecosystem can be placed in parallel.

## Frontmatter Specification (Source of Truth) (→Area 3)

This section is the source of truth for all rules regarding frontmatter. When other files (logic_rules.md, dependency_rules.md) reference frontmatter, they follow this definition.

### Required Fields
- `title`: File title (string)
- `type`: File type. Allowed values: `concept`, `rule`, `spec`, `index`, `architecture`, `config`
- `description`: One-line description (string)

### Relationship Fields (Optional)
- `depends_on`: List of file paths this file depends on
- `related_to`: List of related file paths (undirected association)
- `parent`: Parent concept file path

### Change Tracking Fields (Optional)
- `last_updated`: Last update date (YYYY-MM-DD). Can be omitted when delegated to git
- `update_reason`: Last update reason (string). Can be omitted when delegated to git

## File Structure Required Elements (→Area 3)

- **Body**: Markdown format. One H1 title per file, structured with subsections (H2~H3)
- **File size**: Single file 500 lines or fewer recommended. When exceeded, review concept separation. This value is an empirical criterion considering context efficiency of current major LLMs (128K~1M tokens)

## Directory Structure Rules (→Area 3)

- Maximum depth: 3 levels (e.g., .onto/domains/software-engineering/concepts.md). This value is an empirical criterion for minimizing LLM traversal cost
- Each directory expresses a single concern
- Directory names use plural nouns or domain names (e.g., domains, roles, processes)
- Do not create directories containing only a single file. Place the file in the parent directory
- Recommended files per directory: 3~20. When exceeding 20, review subdirectory separation or sub-index introduction

## Filename Rules (→Area 3)

- Use snake_case (e.g., domain_scope.md, logic_rules.md)
- Filenames directly express the content's role
- Reserved filenames and roles (see "Project Required Files" table above): ARCHITECTURE.md, INDEX.md, README.md, spec.md, llms.txt, and each LLM ecosystem's instruction file
- Avoid order representation using numeric prefixes. Order is specified in INDEX.md

## Reference Chain Upper Limit (→Area 3)

- Files that must be read to perform one task: 5 or fewer recommended. "Task" is defined per scenario in extension_cases.md. This value is an empirical criterion considering LLM context window utilization efficiency

## Required Relationships (→Area 3)

- Every concept file must be referenced by at least 1 other document, or registered in INDEX.md
- Every directory must contain INDEX.md or README.md
- ARCHITECTURE.md must mention all top-level directories and their roles

## Isolated Element Prohibition (→Area 3)

- Concept files referenced by nothing → warning (isolated document)
- Files not registered in INDEX.md → warning (unregistered file)
- Concept files with no relationships in frontmatter → warning (relationships undefined)

## LLM System Architecture Structure (→Area 1, Area 2)

### Required Architectural Components

Every LLM-powered system must have at minimum:

| Component | Purpose | Risk if Missing |
|-----------|---------|-----------------|
| Model connection | Interface to the LLM (API client, SDK wrapper) | System cannot communicate with the model |
| Input design | Prompt construction, context assembly | Inconsistent or inefficient model usage |
| Output handling | Response parsing, validation, error handling | Malformed output propagates to downstream systems |

### Optional Components (required when applicable)

| Component | When Required | Primary Area |
|-----------|--------------|-------------|
| Retrieval pipeline | System needs external knowledge beyond training data | Area 3 |
| Tool integration | Model must take actions in external systems | Area 4 |
| Evaluation pipeline | System output quality must be measured | Area 5 |
| Safety guardrails | System faces adversarial users or produces user-facing content | Area 6 |
| Monitoring and logging | System runs in production | Area 7 |
| Fine-tuning pipeline | Prompting alone cannot meet quality/cost/latency targets | Area 8 |

### Component Interaction Patterns

- **Synchronous (request-response)**: Client sends prompt → waits for model response → processes output. Appropriate when latency tolerance exists and the result is needed immediately
- **Asynchronous (event-driven)**: Request is queued → model processes when available → result is delivered via callback or polling. Appropriate for batch processing, high-throughput systems, or when model response time is unpredictable
- **Streaming**: Model generates tokens incrementally → client receives and displays partial output. Appropriate for user-facing applications where perceived latency matters. Streaming introduces complexity: partial output cannot be validated until the stream completes

## RAG Pipeline Structure (→Area 3)

### Required Stages

Every RAG (Retrieval-Augmented Generation) pipeline must define these stages explicitly. Each stage has defined input/output contracts.

| Stage | Input | Output | Key Design Decision |
|-------|-------|--------|-------------------|
| Ingestion | Raw documents (PDF, HTML, code, etc.) | Normalized text with metadata | Document parser selection, metadata extraction |
| Processing | Normalized text | Chunks with embeddings | Chunking strategy, embedding model selection |
| Storage | Chunks with embeddings | Indexed vector store | Vector database selection, index configuration |
| Retrieval | User query | Ranked relevant chunks with scores | Search algorithm (semantic, keyword, hybrid), reranking |
| Generation | Query + retrieved chunks | Model response | Prompt assembly, citation handling |

### Stage Boundary Rules

- Each stage must be independently testable. If testing retrieval quality requires running generation, the stages are too tightly coupled
- Stage outputs must carry metadata sufficient for debugging: stage name, processing timestamp, and stage-specific metrics (e.g., chunk count, relevance scores)
- Retrieval results must carry relevance scores. Results without scores cannot be filtered, reranked, or used for quality diagnostics

## Agent Architecture Structure (→Area 4)

### Required Components

Every agent-based system must define:

| Component | Description | Constraints |
|-----------|-------------|-------------|
| Model | The LLM powering the agent's reasoning | Must specify model identity, version, and required capabilities |
| Tools | External functions the agent can invoke | Each tool must have a schema (see Tool Definition Structure below) |
| Instructions | System prompt defining agent behavior, goals, and constraints | Must list available tools and specify when each should be used |
| State management | How the agent tracks progress and accumulated information | Must be explicit — implicit state via conversation history is fragile (see logic_rules.md) |

### Tool Definition Structure

Every tool exposed to an agent must include:

```
name:        Unique identifier (snake_case, no spaces)
description: What the tool does and when to use it (self-describing)
parameters:  JSON Schema defining input parameters (types, required fields, constraints)
return_type: Description of what the tool returns (structure, possible error states)
```

If any of these fields is missing, the agent cannot reliably determine when or how to use the tool.

### Multi-Agent Execution profile

When a system uses multiple agents, the coordination execution profile must be explicitly chosen and documented:

| Execution profile | Structure | When to Use |
|----------|-----------|-------------|
| Hub-spoke (orchestrator-workers) | One orchestrator agent delegates tasks to specialized worker agents | Tasks are decomposable into independent subtasks with clear boundaries |
| Peer-to-peer | Agents communicate directly with each other, no central coordinator | Agents have equal authority and need to negotiate or collaborate |
| Hierarchical | Multiple layers of orchestration (manager → team leads → workers) | Large-scale systems with many agents and complex task decomposition |

The choice must be documented with rationale. Default recommendation: hub-spoke (simplest, easiest to debug, clear responsibility boundaries).

## Evaluation Structure (→Area 5)

### Golden Set Requirements

| Attribute | Requirement |
|-----------|-------------|
| Minimum size | Sufficient to detect meaningful quality differences (recommend ≥50 examples for statistical validity) |
| Diversity | Must cover all expected input categories. If the system handles 5 task types, the golden set must include examples of all 5 |
| Update frequency | Must be reviewed when the system's scope changes. Stale golden sets produce misleading evaluation results |
| Separation | Must not overlap with training or fine-tuning data. Contamination invalidates evaluation results |

### Evaluation Pipeline Structure

| Stage | Input | Output |
|-------|-------|--------|
| Data source | Golden set + system under evaluation | Evaluation inputs (query-expected pairs) |
| Evaluation execution | System outputs + expected outputs | Per-example scores and judgments |
| Result storage | Raw evaluation results | Persistent evaluation records (for trend analysis) |
| Analysis | Stored results (current + historical) | Quality metrics, regression detection, trend reports |

Each stage must be automated for production systems. Manual evaluation is acceptable only during initial development or for semantic quality aspects that resist automation.

## Safety Architecture Structure (→Area 6)

### Required Pipeline

User input → **Input guardrails** → Model → **Output guardrails** → User

Each guardrail must define:

| Element | Description | Example |
|---------|-------------|---------|
| Trigger condition | What input/output pattern activates the guardrail | "Input contains known prompt injection patterns" |
| Action | What happens when triggered | "Block request, return safe fallback response" |
| Logging | What is recorded when triggered | "Timestamp, trigger rule ID, input hash, action taken" |

### Guardrail Placement Rules

- Input guardrails run before the model processes the request. They protect the model from adversarial inputs. Cost: added latency before model invocation
- Output guardrails run after the model generates a response. They protect the user from harmful outputs. Cost: added latency after model invocation, before delivery
- Both must be present for defense-in-depth. A system with only input guardrails cannot catch harmful outputs the model generates from benign inputs. A system with only output guardrails cannot prevent resource waste from processing adversarial inputs

## Golden Relationships (Cross-Component Validations)

Golden relationships are structural invariants that connect components across different areas. A violation of any golden relationship indicates a design defect that will manifest as a runtime failure or quality degradation.

- **Model capability ↔ Prompt complexity (Area 1 ↔ Area 2)**: The prompt must not exceed the model's capabilities. If a prompt requires tool use but the model does not support function calling, the system will fail. If a prompt requires reasoning over 100K tokens but the model's context window is 8K, the input will be truncated. Verification: for each prompt template, confirm the target model supports all required features (tool use, structured output, context length)
- **Retrieval relevance ↔ Generation quality (Area 3 ↔ Area 2)**: If retrieval returns irrelevant or insufficient context, generation quality degrades regardless of prompt quality. This relationship is unidirectional: good retrieval does not guarantee good generation, but bad retrieval guarantees degraded generation. Verification: evaluate retrieval quality independently (precision@k, recall@k) before evaluating end-to-end generation quality
- **Tool schema ↔ Agent instructions (Area 4 ↔ Area 4)**: Every tool referenced in agent instructions must exist in the tool registry with a valid schema. Every tool in the registry should be referenced in at least one agent's instructions (unused tools add cognitive load to the agent and may cause unintended tool selection). Verification: cross-reference instruction tool mentions against registered tool names
- **Evaluation criteria ↔ Safety policy (Area 5 ↔ Area 6)**: Safety violations must be a subset of evaluation criteria. If the safety policy prohibits a behavior, the evaluation pipeline must be able to detect that behavior. A safety rule that cannot be evaluated cannot be verified in production. Verification: for each safety policy rule, confirm at least one evaluation metric or test case covers it
- **Cost budget ↔ Model selection (Area 7 ↔ Area 1)**: The selected model's per-token cost, multiplied by expected usage volume, must fit within the operational budget. If the cost projection exceeds the budget, either the model must be downgraded, usage must be reduced (caching, batching), or the budget must be increased. Verification: cost projection = (avg tokens per request × requests per period × cost per token). Projection must be ≤ budget

## Quantitative Thresholds

These thresholds are structural health indicators. Exceeding a threshold does not automatically indicate a defect, but requires explicit justification.

| Metric | Threshold | Source | Rationale |
|--------|-----------|--------|-----------|
| Single file size | 500 lines max | Area 3 | Context efficiency for current LLMs (128K–1M tokens) |
| Directory depth | 3 levels max | Area 3 | Minimizes LLM traversal cost |
| Reference chain | 5 files max | Area 3 | Context window utilization efficiency |
| Agent tool count | < 20 tools per agent | Area 4 | Cognitive load — agents with too many tools make worse tool selection decisions. Empirical finding from Anthropic and OpenAI agent design guides |
| RAG chunk size | 256–2048 tokens | Area 3 | Empirical range. Smaller chunks lose context; larger chunks dilute relevance. Optimal size is model-dependent and task-dependent |
| Golden set size | ≥ 50 examples | Area 5 | Minimum for detecting statistically meaningful quality differences |
| Guardrail false positive rate | < 1% on legitimate traffic | Area 6 | Higher rates degrade user experience unacceptably |
| Prompt template length | ≤ 25% of context window | Area 2 | Leaves room for retrieved context, user input, and model output. Systems exceeding this ratio risk truncation under heavy usage |

## Related Documents
- concepts.md — Term definitions within this domain
- logic_rules.md — Logic rules referencing this file's frontmatter specification and structural constraints
- dependency_rules.md — Referential integrity rules referencing this file's specification
- domain_scope.md — Scope definition, sub-area membership criteria, and 8 sub-areas
- competency_qs.md — Questions this domain's structure must support answering
