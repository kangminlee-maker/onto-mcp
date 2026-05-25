# Onboarding Process

Sets up the active onto project configuration for review-first MCP usage.

## 1. Status Diagnosis

Check the project-local environment:

| Check | Source | Result |
|---|---|---|
| Project config | `{project}/.onto/settings.json` | exists / missing |
| Domains | `.onto/settings.json` `domains:` | list / none |
| Project learnings | `{project}/.onto/learnings/` | exists / missing |
| Codex CLI | `codex --version` | available / missing |
| API keys | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GROK_API_KEY` | available / missing |
| Local endpoint | configured LM Studio base URL | available / missing |

Report the diagnosis before making changes.

## 2. Project Config

Create or update `.onto/settings.json` with the active key surface:

```json
{
  "output_language": "ko",
  "domains": ["ontology"],
  "review_mode": "core-axis",
  "review": {
    "execution": {
      "mode": "main-workers",
      "teamlead": {
        "seat": "main",
        "llm": "inherit"
      },
      "lens": {
        "seat": "worker",
        "llm": "inherit"
      },
      "deliberation": "controlled-lens-deliberation"
    }
  },
  "llm": {
    "auth": "oauth",
    "provider": "openai",
    "model": "gpt-5.5",
    "effort": "medium",
    "service_tier": "fast"
  }
}
```

Validation source: `.onto/processes/configuration.md`.

## 3. Domains

If the user wants domain-aware review, add an unordered `domains:` list. Domain
documents are read from `.onto/domains/{domain}/` or the configured domain pack.

If no domain is selected, review runs with methodology-only lens standards.

## 4. Review Execution

Use `review.execution` for review coordination:

- `mode: main-workers` keeps coordination in main and sends lens judgments to workers.
- `mode: nested-workers` sends teamlead coordination and lens judgments to workers.
- `teamlead.seat` must match the chosen mode.
- `lens.seat` is `worker`.
- `synthesize.seat` is `worker`.
- `deliberation: controlled-lens-deliberation` is required for review.
- In `nested-workers`, `teamlead.llm` configures the outer coordinator worker
  and `lens.llm` configures the inner lens workers. They may use different
  `effort` values.
- `synthesize.llm` configures the final synthesis unit. Prefer high or xhigh
  effort for full reviews because it integrates every successful lens,
  deliberation, issue artifacts, and problem framing.
- `llm: "inherit"` means the actor uses the root `llm` object. An actor object
  such as `{ "effort": "xhigh" }` overlays the root `llm` while keeping the root
  auth, provider, model, and service tier.

Unsupported values stop configuration validation.

## 5. LLM Switcher

Use `llm:` for model access:

| auth | provider | Runtime path |
|---|---|---|
| `oauth` | `openai` | host-bound Codex worker |
| `api_key` | `openai` | OpenAI API |
| `api_key` | `anthropic` | Anthropic API |
| `api_key` | `grok` | xAI/Grok OpenAI-compatible API |
| `local` | `lmstudio` | LM Studio OpenAI-compatible endpoint |

Unsupported auth/provider pairs stop materialization.

## 6. Completion Report

Return:

| Item | Result |
|---|---|
| `.onto/settings.json` | created / updated / unchanged |
| Domains | selected list / none |
| Review mode | `core-axis` / `full` |
| Deliberation | `controlled-lens-deliberation` |
| LLM switcher | `{auth, provider, model}` |

Next command:

```bash
npm run review:invoke -- <target> "<intent>"
```
