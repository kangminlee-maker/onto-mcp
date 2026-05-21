# Configuration — onto project config.yml

**Authority**: rank 5 (functional contract).
**Type source**: `src/core-runtime/discovery/config-chain.ts`.

This document defines the active `.onto/config.yml` surface used by the
productized TypeScript runtime.

---

## 1. File Locations

| Path | Role |
|---|---|
| `{project}/.onto/config.yml` | project-local config |
| `{onto-home}/.onto/config.yml` | optional installation-level defaults |

Project config wins over home config for scalar keys. Arrays are replaced by
the project value, except `excluded_names`, which is merged.

---

## 2. Active Keys

### `output_language`

- Purpose: language for human-facing output.
- Internal prompts and artifacts stay in English unless their contract says otherwise.
- Example: `ko`, `en`.

### `domains`

- Purpose: unordered set of project domain names available for domain-aware review.
- Empty or absent means no project domain is preselected.

### `review_mode`

- Purpose: lens set selection.
- Values:
  - `core-axis`: axiology, coverage, evolution, logic, semantics, structure.
  - `full`: all canonical review lenses.

### `review`

Review execution shape. This block selects orchestration shape, not the LLM
provider API.

```yaml
review:
  teamlead:
    model: main
  subagent:
    provider: main-native
  max_concurrent_lenses: 6
  lens_deliberation: controlled-lens-deliberation
```

Fields:

| Key | Values | Meaning |
|---|---|---|
| `teamlead.model` | `main` or `{provider: codex, model_id, effort?}` | who coordinates review execution |
| `subagent.provider` | `main-native` or `codex` | how individual review units are executed |
| `subagent.model_id` | string | required when `subagent.provider: codex` |
| `subagent.effort` | string | optional provider-specific reasoning effort |
| `max_concurrent_lenses` | positive integer | review unit concurrency cap |
| `lens_deliberation` | `controlled-lens-deliberation` | lens positions are re-evaluated in bounded contexts before synthesize |

`controlled-lens-deliberation` is the review semantic. Each participating lens
first produces an isolated judgment, then re-evaluates its position against the
other lens outputs in a bounded context. A teamlead-controlled step writes
`deliberation.md`; synthesize consumes that artifact and does not create a new
resolution channel.

### `lens_agent_teams_mode`

- Purpose: opt into the Agent Teams transport for controlled lens deliberation
  when the host exposes that tool surface.
- Value: `true` or `false`.
- The semantic remains `controlled-lens-deliberation` when this is absent.

### `llm`

Canonical model switcher.

```yaml
llm:
  auth: oauth
  provider: openai
  model: gpt-5.4
  effort: high
```

Fields:

| Key | Values |
|---|---|
| `auth` | `oauth`, `api_key`, `local` |
| `provider` | `openai`, `anthropic`, `grok`, `lmstudio` |
| `model` | provider model id |
| `effort` | optional reasoning effort |
| `base_url` | optional OpenAI-compatible endpoint URL |

Supported mappings:

| auth | provider | Runtime path |
|---|---|---|
| `oauth` | `openai` | Codex CLI subprocess |
| `api_key` | `openai` | OpenAI API |
| `api_key` | `anthropic` | Anthropic API |
| `api_key` | `grok` | xAI/Grok OpenAI-compatible API |
| `local` | `lmstudio` | LM Studio OpenAI-compatible endpoint |

Unsupported combinations stop execution during config/materialization.

---

## 3. Canonical Example

```yaml
output_language: ko

domains:
  - ontology

review:
  teamlead:
    model: main
  subagent:
    provider: main-native
  lens_deliberation: controlled-lens-deliberation

lens_agent_teams_mode: false
review_mode: core-axis

llm:
  auth: oauth
  provider: openai
  model: gpt-5.4
  effort: high
```

---

## 4. Validation Policy

- Unknown top-level keys stop config loading.
- Invalid `review` values stop topology derivation.
- Unsupported `llm` mappings stop materialization.
- Missing required artifacts stop review completion.

`learn` and `govern` MCP configuration is intentionally left for a separate
design pass.
