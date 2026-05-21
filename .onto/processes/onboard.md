# Onboarding Process

Sets up the active onto project configuration for review-first MCP usage.

## 1. Status Diagnosis

Check the project-local environment:

| Check | Source | Result |
|---|---|---|
| Project config | `{project}/.onto/config.yml` | exists / missing |
| Domains | `.onto/config.yml` `domains:` | list / none |
| Project learnings | `{project}/.onto/learnings/` | exists / missing |
| Codex CLI | `codex --version` | available / missing |
| API keys | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GROK_API_KEY` | available / missing |
| Local endpoint | configured LM Studio base URL | available / missing |

Report the diagnosis before making changes.

## 2. Project Config

Create or update `.onto/config.yml` with the active key surface:

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

Validation source: `.onto/processes/configuration.md`.

## 3. Domains

If the user wants domain-aware review, add an unordered `domains:` list. Domain
documents are read from `.onto/domains/{domain}/` or the configured domain pack.

If no domain is selected, review runs with methodology-only lens standards.

## 4. Review Execution

Use `review:` for orchestration:

- `teamlead.model: main` keeps coordination in the host session.
- `subagent.provider: main-native` uses the host-native isolated execution unit.
- `subagent.provider: codex` uses Codex subprocess execution.
- `lens_deliberation: controlled-lens-deliberation` is required for review.
- `lens_agent_teams_mode: true` selects Agent Teams transport when the host
  exposes it; the semantic remains controlled lens deliberation.

Unsupported values stop configuration validation.

## 5. LLM Switcher

Use `llm:` for model access:

| auth | provider | Runtime path |
|---|---|---|
| `oauth` | `openai` | Codex CLI subprocess |
| `api_key` | `openai` | OpenAI API |
| `api_key` | `anthropic` | Anthropic API |
| `api_key` | `grok` | xAI/Grok OpenAI-compatible API |
| `local` | `lmstudio` | LM Studio OpenAI-compatible endpoint |

Unsupported auth/provider pairs stop materialization.

## 6. Completion Report

Return:

| Item | Result |
|---|---|
| `.onto/config.yml` | created / updated / unchanged |
| Domains | selected list / none |
| Review mode | `core-axis` / `full` |
| Deliberation | `controlled-lens-deliberation` |
| LLM switcher | `{auth, provider, model}` |

Next command:

```bash
npm run review:invoke -- <target> "<intent>"
```
