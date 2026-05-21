# Install — first-run runtime setup

`onto install` creates the runtime configuration needed before review/onboard.

## 1. Install Scope

| Scope | Config path | Use when |
|---|---|---|
| global | `~/.onto/config.yml` | one machine-wide default |
| project | `{project}/.onto/config.yml` | repo-specific model/domain settings |

Project config overrides global config.

## 2. Interactive Flow

```bash
onto install
```

Collect:

1. install scope: `global` or `project`
2. output language: e.g. `ko`, `en`
3. review subagent provider: `main-native` or `codex`
4. deliberation semantic: `controlled-lens-deliberation`
5. Agent Teams transport opt-in: `lens_agent_teams_mode: true|false`
6. LLM auth/provider/model settings

## 3. Non-Interactive Flow

```bash
onto install --non-interactive \
  --profile-scope <global|project> \
  --output-language <ko|en> \
  --llm-auth <oauth|api_key|local> \
  --llm-provider <openai|anthropic|grok|lmstudio> \
  --llm-model <model-id>
```

Missing required values stop execution.

## 4. Canonical Config

```yaml
output_language: ko

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

Full key contract: `.onto/processes/configuration.md`.

## 5. LLM Switcher

| auth | provider | Credential |
|---|---|---|
| `oauth` | `openai` | Codex login |
| `api_key` | `openai` | `OPENAI_API_KEY` |
| `api_key` | `anthropic` | `ANTHROPIC_API_KEY` |
| `api_key` | `grok` | `XAI_API_KEY` or `GROK_API_KEY` |
| `local` | `lmstudio` | `base_url` or LM Studio default endpoint |

Unsupported auth/provider pairs stop execution.

## 6. File Writes

| File | Rule |
|---|---|
| `config.yml` | atomic write |
| `.env` | mode `0600` on POSIX |
| `.env.example` | safe template, no secrets |

Secrets are read from shell env or `.env`, not from command-line credential
values.

## 7. Verification

After writing config:

- config is parsed with the real YAML parser.
- review config is validated by the TypeScript validator.
- provider readiness is checked where the selected auth/provider requires an
  external credential or endpoint.

Validation failure stops execution with a visible error.

## 8. Next Step

```bash
onto onboard
```
