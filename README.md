# Onto

A multi-host LLM-driven runtime that performs multi-perspective verification of logical systems (9-lens review + synthesize) and reconstructs ontologies from analysis targets. Runs as a Claude Code plugin, a Codex CLI subagent, or a standalone CLI process.

## Current Direction: MCP-Native Onto

This local reset treats the TS `onto` runtime as the product core and moves
platform integration toward an MCP-native tool surface.

```text
.onto YAML/MD contracts
        -> TS core runtime
        -> MCP tools
        -> execution providers: codex, claude, ouroboros, local/mock
```

Key docs:

- `docs/decisions/DD-010-onto-mcp-native-tool-surface.md`
- `docs/architecture/repo-layout.md`
- `docs/architecture/mcp-native-tool-surface.md`
- `docs/roadmap.md`

The previous ouroboros addon work is evidence and conformance input, not the
main product path.

## Host Compatibility Matrix

| Host runtime | Detection signal | Main LLM (orchestrator) | Subagent LLM (per-lens) | Status |
|---|---|---|---|---|
| **Claude Code** | `CLAUDECODE=1` (or `CLAUDE_PROJECT_DIR`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) | Claude Code session | TeamCreate (default) / Agent tool / `--codex` / future LiteLLM | ✅ Full |
| **Codex CLI** | `CODEX_THREAD_ID`, `CODEX_CI`, or codex binary + `~/.codex/auth.json` | Codex CLI session | `codex exec --ephemeral` subprocess / future direct LLM | ✅ Full |
| **Standalone CLI** | None of the above (or `ONTO_HOST_RUNTIME=standalone`) | TS process + configured LLM | `inline-http-review-unit-executor` binary (LiteLLM/Anthropic/OpenAI direct call) | ✅ Phase 2 executor; 📐 auto-wiring pending |

**Two-tier LLM model**: the **main LLM** (orchestrator) and the **subagent LLM** (per-lens executor) are independently configurable. Examples:
- Claude Code session as main + LiteLLM 8B as subagent (Phase 2 ✅ via `--executor-bin` override)
- LiteLLM 31B local as main + LiteLLM 8B as subagent (📐 auto-wiring pending)
- Anthropic API direct as main + LiteLLM 8B as subagent (✅ via explicit subagent invocation)

**Phase 1** ✅ shipped: host detection + capability matrix + 2-axis configuration schema.
**Phase 2** ✅ shipped: `inline-http-review-unit-executor` binary (TS process directly calls LiteLLM/Anthropic/OpenAI for lens execution; inline content mode for tool-less hosts). Auto-selection via `host_runtime: standalone` config pending.

Quick test (mock LLM):
```bash
ONTO_LLM_MOCK=1 npm run review:inline-http-unit-executor -- \
  --project-root . --session-root /tmp/sess --onto-home ~/.onto \
  --unit-id logic --unit-kind lens \
  --packet-path /tmp/sess/lens.packet.md \
  --output-path /tmp/sess/round1/logic.md
```

**Override env vars**:
- `ONTO_HOST_RUNTIME=claude|codex|standalone` — explicit host override
- `ONTO_PLUGIN_DIR=<path>` — plugin install location (defaults to `~/.claude/plugins/onto`)

> Productization note:
> this repository is the current prototype/reference line.
> The service-transition authority for this repository starts in:
> - `AGENTS.md`
> - `.onto/principles/productization-charter.md`
> - `.onto/authority/core-lexicon.yaml`
> - `.onto/principles/ontology-as-code-naming-charter.md`
> - `.onto/principles/ontology-as-code-guideline.md`
> - `.onto/principles/llm-runtime-interface-principles.md`
> - `development-records/plan/20260404-prototype-to-service-productization-plan.md`
> - `development-records/audit/20260404-prototype-runtime-llm-boundary-audit.md`
> - `development-records/plan/20260404-review-prototype-to-product-mapping.md`
> - `.onto/processes/review/lens-registry.md`
> - `.onto/processes/review/interpretation-contract.md`
> - `.onto/processes/review/binding-contract.md`
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/record-field-mapping.md`
> - `.onto/processes/review/execution-preparation-artifacts.md`
> - `.onto/processes/review/prompt-execution-runner-contract.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/synthesize-prompt-contract.md`
> - `src/core-runtime/review/artifact-types.ts`
> - `src/core-runtime/review/review-artifact-utils.ts`
> - `src/core-runtime/cli/write-review-interpretation.ts`
> - `src/core-runtime/cli/bootstrap-review-binding.ts`
> - `src/core-runtime/cli/materialize-review-execution-preparation.ts`
> - `src/core-runtime/cli/prepare-review-session.ts`
> - `src/core-runtime/cli/materialize-review-prompt-packets.ts`
> - `src/core-runtime/cli/start-review-session.ts`
> - `src/core-runtime/cli/run-review-prompt-execution.ts`
> - `src/core-runtime/cli/mock-review-unit-executor.ts`
> - `src/core-runtime/cli/codex-review-unit-executor.ts`
> - `src/core-runtime/cli/render-review-final-output.ts`
> - `src/core-runtime/cli/assemble-review-record.ts`
> - `src/core-runtime/cli/complete-review-session.ts`
> - `package.json`
> - `tsconfig.json`

Current bounded `review` path:
- preferred combined entrypoint: `npm run review:invoke -- ...`
- current actual semantic executor realization: `subagent` via `codex exec`
- `onto-harness` 베타 채널에서는 user-facing `review:*` CLI 실행 시 베타 채널 안내가 먼저 출력됨
- internal bounded path:
  - `npm run review:start-session -- ...`
  - `npm run review:run-prompt-execution -- ...`
  - prompt-backed lens / synthesize execution uses `execution-plan.yaml` and `prompt-packets/`
  - `npm run review:complete-session -- ...`

Designed with inspiration from ontology structures, applicable across domains regardless of field -- software, law, accounting, and more.

**Five activities** (`.onto/authority/core-lexicon.yaml#activity_enum`): `review`, `evolve`, `reconstruct`, `learn`, `govern`.

**Two core capabilities**:
- **Verification (review)**: 9 review lenses independently inspect scope-defined targets, then a separate synthesize stage writes the final review result
- **Reconstruct**: Incrementally constructs ontologies from scope-undefined analysis targets (code, spreadsheets, databases, documents) using integral exploration

## Installation

Two install paths are supported. They are not mutually exclusive — you can install the Claude Code plugin for in-session slash commands and also install the npm CLI for terminal usage, sharing the same runtime config.

**After either path finishes, run `onto install` exactly once** to write `config.yml` + `.env` (provider credentials) to `~/.onto/` or `<repo>/.onto/`. The runtime setup is detailed in `.onto/processes/install.md`.

### Path A — Claude Code plugin (marketplace)

Run inside Claude Code:

```
/plugin marketplace add kangminlee-maker/onto
/plugin install onto@kangminlee-maker/onto
/onto:install
```

### Path B — npm global CLI

Run in your terminal:

```bash
npm install -g onto-core
onto install
```

### Non-interactive install (CI / Docker)

`onto install --non-interactive` resolves every decision from flags or `ONTO_INSTALL_*` env vars. Credentials are read from `process.env` (or a user-supplied `--env-file <path>`); they are never accepted via flag.

```bash
onto install --non-interactive \
  --profile-scope project \
  --review-provider anthropic \
  --learn-provider same \
  --output-language ko
# ANTHROPIC_API_KEY must be in env (or --env-file)
```

Full flag reference and troubleshooting: `.onto/processes/install.md`.

## Update

```
/plugin install onto@kangminlee-maker/onto
```

Or if installed via git clone:
```bash
cd "${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}" && git pull
```

Re-run the wizard after an update with `onto install --reconfigure` to re-sync `config.yml` / `.env`, or use `onto config edit` to adjust specific fields without a full rewrite.

When upgrading from a previous version, run the migration since the global data path has changed:

```bash
./migrate-sessions.sh
```

If the learning storage structure has changed (3-path to 2-path + axis tag):
```bash
./migrate-learnings.sh
```

Migration targets:
- `~/.claude/agent-memory/` to `~/.onto/` (global learnings and domain documents)
- `.claude/sessions/` to `.onto/` (project session data)
- `domain:` + `secondary_domains:` → `domains:` unordered set in `.onto/config.yml`

## Domain Document Installation (Optional)

Installing the domain base documents included with the plugin applies domain-specific expert criteria during reviews.

```bash
# Interactive -- select domains
./setup-domains.sh

# Install all
./setup-domains.sh --all

# Install specific domains only
./setup-domains.sh software-engineering finance
```

| Domain | Description |
|---|---|
| `software-engineering` | Code quality, architecture, type safety, testing strategy |
| `llm-native-development` | LLM-friendly file/folder structure, ontology-as-code |
| `finance` | Financial statements, XBRL, accounting equation, cross-company comparison |
| `business` | Business strategy, revenue recognition, ROI, change management |
| `market-intelligence` | Market analysis, competitive intelligence, risk assessment, data reliability |
| `accounting` | K-IFRS, double-entry bookkeeping, tax adjustments, auditing |
| `ontology` | Ontology design, OWL/RDFS/SKOS, classification consistency |
| `ui-design` | UI layout, interaction patterns, accessibility, responsive design |
| `visual-design` | Visual hierarchy, color systems, typography, brand consistency |

Usable without domain documents (verified using general principles). Domain document installation is also suggested when running `/onto:onboard`.

## Getting Started

```
/onto:onboard                              # Set up project environment
/onto:review {target}                      # Run 9-lens review + synthesize (interactive domain selection)
/onto:review {target} --domain ontology    # Run with specific domain (canonical)
/onto:review {target} --no-domain          # Run without domain rules (canonical)
/onto:review {target} --codex              # Use codex host runtime (defaults to subagent)
/onto:reconstruct {path|GitHub URL}        # Reconstruct ontology from analysis target (start → explore → complete → confirm)
/onto:evolve {goal}                        # Add new areas to existing target (brownfield)
```

### Domain Selection

Each process execution selects a single **session domain**. Three ways to specify:

| Method | Canonical | Legacy (still works) | Behavior |
|--------|-----------|----------------------|----------|
| Explicit | `--domain {name}` | `@{domain}` | Non-interactive, uses specified domain |
| No-domain | `--no-domain` | `@-` | Non-interactive, no domain rules applied |
| Interactive / resolved default | (omit) | (omit) | One configured domain: use it directly. Multiple configured domains: prompt for selection when interactive; otherwise fail fast and require explicit domain selection. |

> **Why canonical flags**: Claude Code uses `@filename` syntax to mention/attach files into context. Positional `@{domain}` tokens in onto can be ambiguous in that environment. Prefer `--domain` / `--no-domain`. Legacy `@` syntax is preserved for backward compat. `--domain` and `--no-domain` are mutually exclusive.

Project domains and review execution axes are declared in `.onto/config.yml`:

```yaml
# Canonical as of Review UX Redesign (2026-04-21). See design doc:
# development-records/evolve/20260420-review-execution-ux-redesign.md
domains:
  - software-engineering
  - ontology
output_language: ko
review:
  teamlead:
    model: main                   # "main" = host session (default)
  subagent:
    provider: codex               # main-native | codex | anthropic | openai | litellm
    model_id: gpt-5.4             # required when provider != main-native
    effort: high
  max_concurrent_lenses: 6
  # lens_deliberation: synthesizer-only  # or sendmessage-a2a (requires teams env)
```

`domains:` is an unordered set — order does not matter, no domain has priority over another. Domains can also be selected per session without pre-declaring them.

The `review:` block declares **6 user-facing axes**. Runtime derives one of 6 internal `TopologyShape` s (main_native / main_foreign / main-teams_* / ext-teamlead_native) and dispatches accordingly. Omit the block to use universal fallback defaults. Setup tools:

- `onto config show` — current state + preview the derived topology
- `onto config edit` — interactive stepwise setup
- `onto config set <key> <value>` — single-field mutation
- `onto onboard --re-detect` — re-run environment probes + regenerate `review:` block

Design-integrity audit: `development-records/audit/20260421-shape-pipeline-audit.md`.

> **Legacy execution profile fully retired (P9 complete, 2026-04-21)** — The
> `execution_topology_priority` ladder and the pre-redesign 3-canonical-path
> guidance (Codex CLI / Agent Teams nested / Main-session direct) are
> consolidated into the `review:` axis block above. The P9 runtime cleanup
> track (PRs #161~#166) retired the full legacy layer: resolver priority
> ladder (P9.1), `OntoConfig` field removal (P9.2), always-on topology
> dispatch (P9.3 + m1 caching), atomic-adoption simplification (P9.4), and
> `legacy-field-deprecation` module removal (P9.5). Legacy YAML fields now
> graceful-ignore via type narrowing — no runtime throw. Migration:
> `docs/topology-migration-guide.md` §7.

## Agent Configuration

| ID | Role | Verification Dimension |
|---|---|---|
| `logic` | Logical consistency verifier | Contradictions, type conflicts, constraint clashes |
| `structure` | Structural completeness verifier | Isolated elements, broken paths, missing relations |
| `dependency` | Dependency integrity verifier | Circular, reverse, diamond dependencies |
| `semantics` | Semantic accuracy verifier | Name-meaning alignment, synonyms/homonyms |
| `pragmatics` | Pragmatic fitness verifier | Queryability, competency question testing |
| `evolution` | Evolution fitness verifier | Breakage on new data/domain addition |
| `coverage` | Domain coverage verifier | Missing subdomains, concept bias, gaps vs. standards |
| `conciseness` | Conciseness verifier | Duplicate definitions, over-specification, unnecessary distinctions |
| `axiology` | Purpose and value alignment verifier | Preventing purpose drift, surfacing value conflicts, checking mission alignment |
| `synthesize` | Review synthesis stage | Organizing consensus, disagreement, and final review output from the lens set |

> Legacy note: `philosopher` has been retired as a canonical review/build pipeline role. The archival definition is preserved at `development-records/legacy/philosopher.md` for lineage reference. The canonical review structure is `9 lenses + synthesize`. `ask` activity is retired (§1.2) — single lens review로 대체.

## LLM Provider Configuration (learn·govern·promote)

Background tasks (learn/govern/promote) use cost-ordered provider resolution. Lower-cost providers are preferred automatically; explicit overrides win over cost-order.

**Resolution ladder** (higher priority first):

1. **Caller-explicit** — programmatic `callLlm(..., { provider })`.
2. **Config-explicit** — `api_provider` in `.onto/config.yml`.
3. **codex CLI OAuth subscription** — `~/.codex/auth.json` with `auth_mode: "chatgpt"` + `codex` binary on PATH. Subscription billing (chatgpt Plus/Pro/Team). Invoked as `codex exec --ephemeral -`.
4. **LiteLLM** — `llm_base_url` resolved via CLI flag / `LITELLM_BASE_URL` env / project config / onto-home config. OpenAI-compatible proxy; downstream model/pricing determined by proxy config.
5. **Anthropic API key** — `ANTHROPIC_API_KEY` env. Per-token billing.
6. **OpenAI per-token** — `OPENAI_API_KEY` env, or `~/.codex/auth.json` `OPENAI_API_KEY` field (API-key mode). Per-token billing.

Credential 전무 시 fail-fast with cost-order guidance. Host main-model delegation (using the surrounding Claude Code / codex session's own model) belongs to a separate **execution realization** axis and is out of scope for this ladder.

> **Review execution is a separate axis** — lens + synthesize 실행의 host/model 선택은 `.onto/config.yml` 의 `review:` axis block (A teamlead / B subagent / C concurrency / E deliberation) 에서 결정합니다. Background task LLM (본 섹션) 과 독립. 전체 key surface 는 `.onto/processes/configuration.md` §4.5 "Review-specific" 참조.

### Config examples

**Auto (recommended)** — leave `.onto/config.yml` alone and let cost-order pick:

```yaml
# .onto/config.yml
# (no api_provider set — cost-order auto-resolution)
```

**codex OAuth explicit**:

```yaml
api_provider: codex
# codex CLI picks its own default when model is omitted. chatgpt Plus/Pro/Team
# accounts have a restricted model allowlist — hardcoded defaults were removed
# because openai-native IDs (e.g. gpt-4o-mini) are rejected with:
#   "The '<model>' model is not supported when using Codex with a ChatGPT account."
# If you want to pin a model, use one from the codex allowlist for your account:
codex:
  model: gpt-5-codex      # example; choose one compatible with your subscription
  effort: medium
```

**LiteLLM (local model or self-hosted proxy)**:

```yaml
api_provider: litellm
llm_base_url: http://localhost:4000/v1
litellm:
  model: claude-sonnet-local     # per-provider override (preferred)
# OR top-level fallback:
# model: claude-sonnet-local
```

**Model configuration** — per-provider + top-level fallback pattern:

```yaml
# Per-provider model — applied when the provider is selected, regardless of whether
# api_provider was explicit or cost-order auto-resolution picked it.
anthropic: { model: claude-sonnet-4-20250514 }
openai:    { model: gpt-4o }
codex:     { model: gpt-5-codex, effort: medium }
litellm:   { model: claude-sonnet-local }

# Top-level fallback — used when the selected provider has no per-provider model set.
model: claude-sonnet-4-20250514
```

Per-call resolution order (dispatch picks the first non-empty):

1. Runtime `LlmCallConfig.model_id` from the call site
2. `OntoConfig.{provider}.model` where `{provider}` is whichever the ladder resolved
3. `OntoConfig.model` as last fallback
4. For anthropic / openai / litellm: fail fast with guidance if still unset. For codex: omit `-m` and let the codex CLI pick.

Because per-provider models apply under auto-resolution too, setting only `anthropic: { model: ... }` without `api_provider` works — when cost-order picks anthropic, that model is used.

Or via environment (임시 라우팅):

```bash
export LITELLM_BASE_URL=http://staging-litellm:4000/v1
export LITELLM_API_KEY=sk-proxy-token   # if the proxy authenticates
```

**Force per-token API** (거스르려면 명시):

```yaml
api_provider: anthropic
model: claude-sonnet-4-20250514
```

### Transition cases (기존 사용자가 자동 전환될 수 있는 조건)

- `~/.codex/auth.json` chatgpt OAuth + codex binary + `ANTHROPIC_API_KEY` env 모두 존재: 이전에는 Anthropic 사용, 지금은 **codex OAuth 구독 경로로 전환**. 세션당 1회 STDERR 안내 로그가 뜹니다. 명시적으로 Anthropic을 원하면 `.onto/config.yml`에 `api_provider: anthropic`.
- OAuth 자격 있는데 codex 바이너리 없음: 이전에는 "not supported" 에러, 지금은 다음 cost-order 경로로 graceful fallback + 설치 안내 1회. opt-out: `suppress_codex_install_notice: true`.
- 이전 "not supported" 에러는 삭제됨. OAuth는 이제 공식 최상위 경로.

### Design record

- `development-records/plan/20260415-litellm-provider-design.md` — cost-order 설계의 정본
- `.onto/authority/core-lexicon.yaml` — `LlmCompatibleProxy`, `LlmBillingMode` 개념 정의

## Commands

### Team Review
| Command | Description |
|---|---|
| `/onto:review {target}` | 9-lens review + synthesize (interactive domain selection) |
| `/onto:review {target} @{domain}` | Review with specified domain |
| `/onto:review {target} @-` | Review without domain rules |
| `/onto:review {target} --codex` | Use Codex CLI execution path |
| `/onto:review --target-scope-kind bundle --primary-ref {root} --member-ref {path}` | Review an explicit bundle target |

### Individual Query (retired)

> `ask` activity는 §1.2에서 폐기되었습니다. 단일 lens에 질의가 필요하면 `/onto:review`를 사용하세요.

### Ontology Reconstruct/Transform
| Command | Description |
|---|---|
| `/onto:reconstruct {path\|URL}` | Reconstruct ontology from analysis target (integral exploration). 4-step bounded path: `start → explore → complete → confirm` |
| `/onto:reconstruct confirm --session-id <id> --verdict passed\|rejected` | Record Principal verification result for the produced `ontology-draft.md` |
| `/onto:transform {file}` | Transform Raw Ontology to desired format |

### Evolve
| Command | Description |
|---|---|
| `/onto:evolve {goal}` | 온톨로지 기반 설계 — 기존 설계 대상에 새 영역 추가 (brownfield) |
| `/onto:evolve {goal} @{domain}` | Evolve with specific domain |
| `/onto:evolve {goal} @-` | Evolve without domain rules |

### Environment Management
| Command | Description |
|---|---|
| `/onto:onboard` | Set up onto environment for a project |
| `/onto:promote` | Learning Quality Assurance — 승격, 큐레이션, 감사 |
| `/onto:health` | Show learning pool health dashboard |
| `/onto:help` | Display full command reference (respects output_language) |

### Domain Document Management
| Command | Description |
|---|---|
| `/onto:create-domain {name} {desc}` | Generate seed domain documents from minimal input |
| `/onto:feedback {domain}` | Feed accumulated learnings back into domain documents |
| `/onto:promote-domain {domain}` | Promote seed domain from drafts/ to domains/ |

### Data Management
| Command | Description |
|---|---|
| `/onto:backup` | Snapshot learnings, domains, drafts, communication for rollback |
| `/onto:backup "reason"` | Backup with descriptive reason |
| `/onto:restore` | List available backups |
| `/onto:restore {backup-id}` | Restore from specific backup (auto-creates safety backup) |

## Review Flow (Canonical Live Path)

```
user request
-> 호출 해석 (InvocationInterpretation)
-> 주체자 확인 / 선택 확정
-> 호출 고정 (InvocationBinding)
-> execution preparation artifacts
-> 9개 lens 독립 실행
-> 종합 단계 (synthesize)
-> 리뷰 기록 (ReviewRecord)
-> human-readable final output
```

- `legacy source path`는 여전히 참고 source이지만, canonical live execution truth는 위 순서다
- Round 1 lens 실행은 서로 독립적이어야 하며, 다른 lens 결과를 보지 않는다
- `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`는 선택적 최적화가 아니라, `lens별 독립성`과 메인 콘텍스트 보존을 위한 canonical requirement다
- lens 결과 markdown과 `synthesis.md`는 human-readable source layer이고, primary artifact는 `review-record.yaml`이다
- deliberation은 contested point가 있을 때만 조건부로 추가된다
- `review` core replacement는 TypeScript로 구현되며, artifact seat와 type name은 ontology-as-code 개념어와 직접 연결된다

**Execution paths** (2026-04-13 정책):

| Path | Entry | Execution |
|---|---|---|
| Codex CLI | `onto review ... --codex` | `codex` CLI child process per bounded unit |
| Agent Teams nested spawn | `onto coordinator start ...` (from a Claude Code session) | TeamCreate + nested Agent tool spawn |

Only these two paths are supported; other executor paths were removed due to Claude CLI authentication instability.

## Ontology Build (Integral Exploration)

Unlike verification (review), build deals with undefined scope, so it uses an **integral exploration** structure:

```
+---------------------------------------------+
|            Explorer (source traverser)       |
|  Directly traverses source and generates     |
|  deltas (domain fact reports)                |
+----------+-------------------+--------------+
           | delta report       | epsilon received
           v                   ^
+---------------------------------------------+
|     Verification agents (direction guides)   |
|  Attach labels (ontology types) to deltas    |
|  Suggest epsilons (next directions)          |
|  from their own axis gaps                    |
|  Do NOT directly traverse the source         |
+----------+-------------------+--------------+
           | epsilon report     | integrated directive
           v                   ^
+---------------------------------------------+
|          Philosopher (coordinator)           |
|  Integrates epsilons, judges convergence,    |
|  manages ontology consistency                |
+---------------------------------------------+

Termination = (all modules explored at least once) AND (new facts = 0)
```

### Purpose: Precise Reproduction

The purpose of ontology build is to **precisely reproduce the analysis target**. It is not about judging new problems using the ontology.

- **Directly observable from source**: Structural facts -> `observed`
- **Implemented in source but without rationale**: Business policies -> `rationale-absent`
- **Reasonable inference but not directly verifiable**: Inferred from patterns -> `inferred` (inference quality presented alongside)
- **Multiple valid interpretations**: Equally valid interpretations diverge -> `ambiguous` (subject to user selection)
- **Not in source**: Design intent, user experience -> `not-in-source` (subject to user decision)

### Build Flow

```
0.  Schema negotiation (select ontology structure with user)
0.5 Context Gathering (collect documents, user context, related repos)
1.  Integral exploration loop -- proceeds in 2 Stages
    +-- Stage 1: Structure (identify Entity, Enum, Relation, Property; max 5 rounds)
    +-- Stage 2: Behavior (identify State Machine, Command, Query, Policy, Flow; max 5 rounds)
    Stage 2 proceeds after Stage 1 converges. Stage 2 references Stage 1's confirmed results.
2.  Finalization (Philosopher review, wip.yml -> raw.yml)
3.  User confirmation (certainty distribution, coverage, items requiring decisions)
4.  Storage
5.  Learning storage
```

## Directory Structure

```
onto/
+-- BLUEPRINT.md             # System overview for users
+-- process.md               # Common definitions (agent configuration, domain rules, Agent Teams)
+-- learning-rules.md        # Learning storage rules, tags, consumption (teammate reference)
+-- .onto/authority/               # Canonical data (배포 포함)
|   +-- core-lexicon.yaml             # Concept SSOT (rank 1)
|   +-- core-lens-registry.yaml       # Lens config (runtime)
|   +-- translation-reference.yaml    # Term translation (onboarding, NON-AUTHORITATIVE)
+-- .onto/principles/      # Development governance (배포 제외)
|   +-- ontology-as-code-guideline.md       # OaC rules (rank 2)
|   +-- llm-native-development-guideline.md # LLM-native principles (rank 2)
|   +-- productization-charter.md           # Product direction (rank 3)
|   +-- llm-runtime-interface-principles.md # Interface spec (rank 4)
|   +-- ontology-as-code-naming-charter.md  # Naming rules (rank 4)
+-- .onto/processes/
|   +-- review.md           # Team review mode (6 steps)
|   +-- question.md         # Individual query mode
|   +-- build.md            # Ontology build (integral exploration)
|   +-- transform.md        # Ontology transform
|   +-- onboard.md          # Onboarding
|   +-- promote.md          # Learning promotion
|   +-- create-domain.md    # Seed domain generation
|   +-- feedback.md         # Domain document feedback loop
|   +-- promote-domain.md   # Seed to established promotion
|   +-- backup.md            # Data backup
|   +-- restore.md           # Data restore
|   +-- health.md            # Learning health dashboard
+-- .onto/roles/
|   +-- logic.md        # Logical consistency
|   +-- structure.md    # Structural completeness
|   +-- dependency.md   # Dependency integrity
|   +-- semantics.md    # Semantic accuracy
|   +-- pragmatics.md   # Pragmatic fitness
|   +-- evolution.md    # Evolution fitness
|   +-- coverage.md     # Domain coverage
|   +-- conciseness.md  # Conciseness
|   +-- axiology.md     # Purpose and value alignment
|   +-- synthesize.md   # Review synthesis
+-- explorers/               # Explorer profiles for reconstruct process
+-- .onto/domains/           # Domain base documents (8 per domain)
+-- golden/                  # Golden examples per schema + schema templates
+-- development-records/     # Development history (배포 제외)
|   +-- legacy/
|   |   +-- philosopher.md   # Archive-only lineage reference (retired from review and build)
|   +-- tracking/20260330-known-issues.md
|   +-- tracking/20260406-discovered-enhancements.md
|   +-- reference/20260327-philosophical-foundations-of-ontology.md
|   +-- design/20260327-build-generalization.md
|   +-- bug/20260330-subagent-fallback-on-first-install.md
|   +-- design/20260329-domain-document-creation.md
|   +-- design/20260330-learning-lifecycle-management.md
|   +-- design/20260330-optimization-4features.md
|   +-- design/20260328-per-session-domain-selection.md
+-- .onto/commands/          # Command definitions (Phase 1 layout)
+-- setup-domains.sh         # Domain base document installation
+-- migrate-sessions.sh      # Previous version data migration
+-- migrate-learnings.sh     # Learning storage structure migration
+-- .claude-plugin/          # Plugin metadata
```

### Runtime-Generated Directories

```
{project}/.onto/           # Runtime data (gitignored)
+-- review/{session-id}/          #   review session (round1/ + synthesis.md)
+-- builds/{session-id}/          #   build session (round0~N/ + schema, raw.yml, etc.)
+-- learnings/                    #   Project-level learnings
```

## Learning System

Agents accumulate learnings through reviews and queries. 학습의 전체 수명주기(생성·승격·보존·소비·퇴역)는 Learning Management로 정의되며, promote 프로세스가 Learning Quality Assurance(승격·큐레이션·감사)를 수행한다. Learnings are stored using a 2-path + axis tag model:

| Storage Location | Scope |
|---|---|
| `~/.onto/learnings/{agent-id}.md` | Global learnings |
| `{project}/.onto/learnings/{agent-id}.md` | Project-level learnings |

Each learning item is tagged with type, axis, and purpose tags:

| Tag Category | Tag | Description |
|---|---|---|
| Type tag | `[fact]` / `[judgment]` | Classification of the learning's nature |
| Axis tag | `[methodology]` | Domain-independent verification technique |
| Axis tag | `[domain/{name}]` | Learning attributed to a specific domain (uses session domain) |
| Purpose tag | `[guardrail]` | Failure-derived prohibition (3 required elements). Also serves as the sole indicator of failure experience |
| Purpose tag | `[foundation]` | Prerequisite knowledge for other learnings |
| Purpose tag | `[convention]` | Terminology/procedure agreement |
| Purpose tag | `[insight]` | Default — all other learnings |

- Item format: `- [fact|judgment] [methodology] [domain/SE] [insight] learning content (source: ...) [impact:normal]`
- Inline tags are the **source of truth** for classification; section headers are human navigation aids
- `impact_severity` (`high`/`normal`) is set at creation time and never changed
- Communication learnings are stored separately at `~/.onto/communication/common.md` (unchanged)
- Project-level learnings can be promoted to global-level via `/onto:promote`
- Domain documents are never auto-modified without explicit user approval

### Axis Tag Determination (2+1 Stage Test)

Each learning's axis tags are determined via a mandatory 2+1 stage test before storage:

| Stage | Question | If triggered |
|---|---|---|
| **A** (Sanity check) | Does the principle hold after removing domain-specific terms? | No → `[domain/X]` only |
| **B** (Applicability) | Does applying this presuppose domain-specific conditions? | Yes → `[methodology]` + `[domain/X]` |
| **C** (Counterexample) | Can you identify a domain where this produces incorrect results? | Yes → `[methodology]` + `[domain/X]` |

- A passes + B passes + C passes (no counterexample) → `[methodology]` only
- Uncertainty at B or C → dual-tag + uncertainty flag (resolved at promote)
- No-domain mode → `[methodology]` only
- Domain document absent → skip B, assign dual-tag (re-evaluate at first promote)

### Consumption Rules

| Rule | Condition | Action |
|---|---|---|
| 1 | `[methodology]` | Always apply |
| 2 | `[domain/{session_domain}]` | Always apply |
| 3 | `[domain/{other}]` only | Review then judge |
| 4 | No tags (legacy) | Treat as `[methodology]` |
| 5 | `[methodology]` + `[domain/X]` dual-tag | Always apply. Domain tag is provenance |
| 6 | Purpose type tags | Do not affect consumption filtering |

### Domain Fact Recording

During reviews and queries, if a domain-specific fact (data format, industry rule, tool behavior, regulatory constraint, etc.) **influenced an agent's judgment**, it is recorded as a separate `[fact] [domain/{session_domain}]` learning entry. Each verification agent also surfaces domain-specific premises used during verification, regardless of whether they are already documented.

### Deduplication at Promote

`/onto:promote` (or the `onto promote` CLI subcommand) runs two deduplication passes:

1. **Criterion 5 — candidate-vs-global same-principle test**: identifies domain variants of existing global learnings (e.g., a [domain/finance] learning that restates a [domain/accounting] principle after removing domain-specific terms). Same-principle entries are consolidated into a single entry with representative cases from diverse domains.
2. **Criterion 6 — cross-agent same-principle test**: identifies the same principle appearing under different agent-specific framings across multiple lens files (e.g., `structure` and `coverage` both writing the same underlying rule with different vocabulary). LLM-driven, cost-bounded discovery with a deterministic primary-owner selection rule (earliest `source_date` among shortlist members).

Both passes surface their findings in the `PromoteReport` for operator approval before any file mutation. Phase B (apply) runs under a best-effort advisory file lock and fails-closed on partial-apply detection.

### Insight Reclassification

Legacy `[insight]`-tagged learnings (the default "we don't yet know the role" bucket) can be reclassified into `[guardrail]` / `[foundation]` / `[convention]` (or dropped entirely) using the CLI:

```bash
onto reclassify-insights                              # analyze: produce report
onto reclassify-insights --apply <report-path>        # apply: rewrite role tags
onto reclassify-insights --apply <report-path> --dry-run  # preview without writing
```

The apply path uses `line_number` as the primary anchor and `raw_line` verbatim match as a secondary anchor, so rerunning is idempotent and source-drift cases fail closed rather than silently succeed.

### Consumption Feedback

리뷰/질문 수행 시 적용된 학습을 기록하고, 적용 후 무효/유해로 판단된 학습에는 이벤트 마커를 부착한다. 마커가 축적된 학습은 promote 실행 시 퇴역 후보로 표면화된다.

### Collection Health Snapshot

promote 완료 시 학습 풀의 집합 상태를 스냅샷으로 보고한다: 축별 분포, 목적 유형 분포, judgment 비율, 중복 후보, 태그 재평가 변경 건수 등.

## Domain Documents (8 types)

| Type | Document | When Absent | Update Method |
|---|---|---|---|
| Scope-defining | `domain_scope.md` | Role becomes ineffective | Promote suggestion -> user approval |
| Accumulable | `concepts.md`, `competency_qs.md` | Reduced performance | Promote suggestion -> user approval |
| Rule-defining | `logic_rules.md`, `structure_spec.md`, `dependency_rules.md`, `extension_cases.md`, `conciseness_rules.md` | Reduced performance (LLM can substitute) | User writes directly |

### Seed Documents (drafts/)

Seed documents share the same 8-file structure but are generated from minimal input via `/onto:create-domain`. They contain SEED markers on low-confidence content and are stored in `~/.onto/drafts/{domain}/`. Seeds are improved through `/onto:feedback` and promoted via `/onto:promote-domain` once all SEED markers are removed.

**Key invariant**: Seed documents are never used as agent verification standards.

## Migration

> **Note**: If this is a fresh installation, skip this section. Migration is only needed when upgrading from a previous version.

If runtime data from a previous version is stored under `.claude/`, the following scripts can move it to `.onto/`.

Migration targets:
- `.claude/sessions/` to `.onto/review/`, `.onto/builds/`
- `.claude/learnings/` to `.onto/learnings/`
- `.claude/ontology/` to `.onto/builds/{session-id}/`
- `.onto/sessions/` intermediate layer removed for review/builds (directly under `review/`, `builds/`). promote sessions remain at `.onto/sessions/promote/`

```bash
# Preview targets (no actual moves)
./migrate-sessions.sh --dry-run

# Run migration
./migrate-sessions.sh

# Specify another project
./migrate-sessions.sh /path/to/project
```

Automatically skipped if no previous data exists.

### Learning Storage Structure Migration

If learnings from a previous version are spread across 3 paths (`methodology/`, `domains/{domain}/learnings/`, `communication/`):

```bash
# Preview targets (no actual changes)
./migrate-learnings.sh --dry-run

# Run migration
./migrate-learnings.sh
```

Changes:
- `~/.onto/methodology/{agent}.md` -> merged into `~/.onto/learnings/{agent}.md` with `[methodology]` tag
- `~/.onto/domains/{domain}/learnings/{agent}.md` -> merged into `~/.onto/learnings/{agent}.md` with `[domain/{domain}]` tag
- Tag position normalized: `- [type] [axis-tag...] learning content (source: ...)`
- Original files backed up to `~/.onto/_backup_migration_{date}/`

Automatically skipped if no previous structure exists.
