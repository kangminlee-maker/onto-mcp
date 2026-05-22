# Configuration — onto settings.json

**Authority**: rank 5 (functional contract).
**Type source**: `src/core-runtime/discovery/settings-chain.ts`.

This document defines the active `.onto/settings.json` surface used by the
productized TypeScript runtime.

---

## 1. File Locations

| Path | Role |
|---|---|
| `{project}/.onto/settings.json` | project-local settings |
| `~/.onto/settings.json` | optional user defaults |

Project settings win over user settings for scalar keys. `excluded_names` is
merged so user-level ignores remain in effect.

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

### `review.execution`

Review execution shape. This block selects where coordination and lens work run.
It does not select the provider API.

```json
{
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
      "deliberation": "controlled-lens-deliberation",
      "max_concurrent_workers": 6
    }
  }
}
```

Fields:

| Key | Values | Meaning |
|---|---|---|
| `mode` | `main-workers`, `nested-workers` | execution shape |
| `teamlead.seat` | `main`, `worker` | who coordinates the review |
| `teamlead.llm` | `inherit` or `llm` object | teamlead model selection |
| `lens.seat` | `worker` | where lens judgments run |
| `lens.llm` | `inherit` or `llm` object | lens model selection |
| `deliberation` | `controlled-lens-deliberation` | required review deliberation semantic |
| `max_concurrent_workers` | positive integer | review unit concurrency cap |

Valid shapes:

| mode | teamlead seat | lens seat | Behavior |
|---|---|---|---|
| `main-workers` | `main` | `worker` | main coordinates; isolated workers run lens units. |
| `nested-workers` | `worker` | `worker` | a worker teamlead coordinates nested isolated lens workers. |

`controlled-lens-deliberation` is the review semantic. Each participating lens
first produces an isolated judgment, then re-evaluates its position against the
other lens outputs in a bounded context. A teamlead-controlled step writes
`deliberation.md`; synthesize consumes that artifact and does not create a new
resolution channel.

Edit `.onto/settings.json` directly. Unsupported shapes stop during settings
resolution before review preparation continues.

### `llm`

Canonical model switcher.

```json
{
  "llm": {
    "auth": "oauth",
    "provider": "openai",
    "model": "gpt-5.5",
    "effort": "medium",
    "service_tier": "fast"
  }
}
```

Fields:

| Key | Values |
|---|---|
| `auth` | `oauth`, `api_key`, `local` |
| `provider` | `openai`, `anthropic`, `grok`, `lmstudio` |
| `model` | provider model id |
| `effort` | optional reasoning effort |
| `service_tier` | Codex-only service tier; requires `auth: oauth` + `provider: openai` |
| `base_url` | optional OpenAI-compatible endpoint URL |
| `api_key_env` | optional environment variable name for API key lookup |

Supported mappings:

| auth | provider | Runtime path |
|---|---|---|
| `oauth` | `openai` | host-bound Codex worker |
| `api_key` | `openai` | OpenAI API |
| `api_key` | `anthropic` | Anthropic API |
| `api_key` | `grok` | xAI/Grok OpenAI-compatible API |
| `local` | `lmstudio` | LM Studio OpenAI-compatible endpoint |

Unsupported combinations stop execution during settings/profile resolution.

---

## 3. Canonical Example

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
      "deliberation": "controlled-lens-deliberation",
      "max_concurrent_workers": 6
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

---

## 4. Validation Policy

- Unknown top-level keys stop settings loading.
- Invalid `review.execution` values stop profile derivation.
- Unsupported `llm` mappings stop runtime preparation.
- Missing required artifacts stop review completion.

`learn` and `govern` MCP settings are intentionally left for a separate design
pass.
