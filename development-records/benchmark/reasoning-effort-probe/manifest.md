# Reasoning-effort acceptance probe (2026-07-28)

Evidence for `.onto/authority/model-reasoning-efforts.yaml`. Every row is a real
dispatch of the prompt `Reply with exactly: ok` against the installed CLI; raw
stdout/stderr for each is in `raw/`.

## Why the negative controls decide everything

The two surfaces fail in opposite ways, so `rc=0` means different things on each.
Running the controls first is what makes the rest of the table readable.

| Surface | Control | rc | What it proves |
|---|---|---|---|
| codex CLI | `--effort banana` | **1** | Fails loud. Provider returns 400 and names the schema enum: `'none', 'minimal', 'low', 'medium', 'high', 'xhigh', and 'max'`. So on this surface `rc=0` **is** acceptance evidence. |
| Claude Code CLI | `--effort banana` | **0** | **Fails open** — stderr carries `Warning: Unknown --effort value 'banana' — ignoring it and using the default effort. Valid values: low, medium, high, xhigh, max.` and the run proceeds at the default. So on this surface `rc=0` proves nothing; the discriminator is **presence or absence of that warning**. |

`ultra` does not appear in the provider's schema enum yet is accepted through the
codex CLI, and `ultracode` does not appear in `claude --help` yet is accepted by
Claude Code. Both CLIs own a vocabulary and map it before dispatch — which is why
the authority file is keyed by execution surface and not by model alone.

## codex CLI (`codex-run --profile hermetic --sandbox read-only`)

| Model | Effort | rc | Evidence |
|---|---|---|---|
| gpt-5.6-sol | `none` | 0 | `raw/sol-none.*` |
| gpt-5.6-sol | `max` | 0 | `raw/sol-max.*` |
| gpt-5.6-sol | `ultra` | 0 | `raw/sol-ultra.*`, banner `reasoning effort: ultra` |
| gpt-5.6-sol | `minimal` | **1** | `raw/sol-minimal.err` — `Unsupported value: 'minimal' is not supported with the 'gpt-5.6-sol-1p-codexswic-ev3' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.` |
| gpt-5.6-terra | `ultra` | 0 | `raw/gpt-5.6-terra-ultra.*` |
| gpt-5.6-luna | `ultra` | 0 | `raw/gpt-5.6-luna-ultra.*` |
| gpt-5.6-terra | `high` | 0 | full review dispatch, `benchmark/reconciliation-review-r2/terra-high/` |
| gpt-5.6-sol | `max` | 0 | full review dispatch, `benchmark/reconciliation-review-r2/sol-max/` |
| gpt-5.6-luna | `high` | 0 | full review dispatch, `benchmark/reconciliation-review-r2/luna-high/` |

Note the deployment id in the `minimal` rejection: the model served behind the
codex CLI is `gpt-5.6-sol-1p-codexswic-ev3`, and the set it names excludes both
`max` and `ultra` — values the CLI nonetheless accepts. That is the mapping layer,
not a contradiction.

## Claude Code CLI 2.1.220 (`claude -p`)

`--help` registers `--effort <level>` as `(low, medium, high, xhigh, max)`.

| Model | Effort | rc | Effort warning on stderr | Reading |
|---|---|---|---|---|
| claude-opus-5 | `ultracode` | 0 | **none** (`raw/opus5-ultracode.err` is empty) | accepted, undocumented |
| claude-opus-5 | `banana` | 0 | **yes** (`raw/neg-claude.err`) | rejected → default |
| claude-haiku-4-5 | `high` | 0 | none¹ | accepted by the CLI |
| claude-haiku-4-5 | `ultracode` | 0 | none¹ | accepted by the CLI |

¹ The stderr on these two rows carries only an unrelated `no stdin data received`
warning, not an effort warning.

The haiku rows matter because the Anthropic API documents effort as **unsupported**
on Claude Haiku 4.5 — the CLI does not surface that restriction. Hence the split
in the authority file: `anthropic_sdk` + `claude-haiku-4-5` is an empty set, while
`claude_code` + `claude-haiku-4-5` carries the `--help` enum.

## Not probed

- `gpt-5.5` on either surface (doc set used).
- `ultracode` on `claude-fable-5` — under a monthly spend limit in this environment.
- `ultracode` on `claude-opus-4-8` / `claude-sonnet-5`.
- Direct-API (`openai_sdk` / `anthropic_sdk`) acceptance for any model: no metered
  API key is configured here, so those entries rest on vendor documentation.

Each omission is carried into the authority entry's `provenance` rather than
guessed at, and the affected values are left out of the accepted set.
