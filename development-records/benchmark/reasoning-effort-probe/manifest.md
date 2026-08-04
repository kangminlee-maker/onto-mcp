# Reasoning-effort acceptance probe (2026-07-28)

Evidence for `.onto/authority/model-reasoning-efforts.yaml`. Every row is a real
dispatch of the prompt `Reply with exactly: ok` against the installed CLI; raw
stdout/stderr for each is in `raw/`.

Re-run any of it with `scripts/probe-reasoning-effort.mts`, which encodes the
per-surface verdict rule below and refuses to report anything until its own
controls come out different:

```
npx tsx scripts/probe-reasoning-effort.mts --surface codex_cli --model gpt-5.6-sol --effort ultra
npx tsx scripts/probe-reasoning-effort.mts --surface claude_code --model claude-opus-5 --self-test
```

## Why the negative controls decide everything

The two surfaces fail in opposite ways, so `rc=0` means different things on each.
Running the controls first is what makes the rest of the table readable.

| Surface | Control | rc | What it proves |
|---|---|---|---|
| codex CLI | `--effort banana` | **1** | Fails loud. Provider returns 400 and names the schema enum: `'none', 'minimal', 'low', 'medium', 'high', 'xhigh', and 'max'`. So on this surface `rc=0` **is** acceptance evidence. |
| Claude Code CLI | `--effort banana` | **0** | **Fails open** — stderr carries `Warning: Unknown --effort value 'banana' — ignoring it and using the default effort. Valid values: low, medium, high, xhigh, max.` and the run proceeds at the default. So on this surface `rc=0` proves nothing; the discriminator is **presence or absence of that warning**. |

`ultra` does not appear in the provider's schema enum yet is accepted through the
codex CLI, and `ultracode` does not appear in `claude --help` yet is accepted by
Claude Code. Neither listing is a complete account of what its surface takes,
which is why the authority records measured acceptance per surface rather than
quoting either one.

## codex CLI (`codex-run --profile hermetic --sandbox read-only`)

| Model | Effort | rc | Evidence |
|---|---|---|---|
| gpt-5.6-sol | `none` | 0 | `raw/sol-none.*` |
| gpt-5.6-sol | `max` | 0 | `raw/sol-max.*` |
| gpt-5.6-sol | `ultra` | 0 | `raw/sol-ultra.*`, banner `reasoning effort: ultra` |
| gpt-5.6-sol | `minimal` | **1** | `raw/sol-minimal.err` — `Unsupported value: 'minimal' is not supported with the 'gpt-5.6-sol-1p-codexswic-ev3' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.` |
| gpt-5.6-terra | `ultra` | 0 | `raw/gpt-5.6-terra-ultra.*` |
| gpt-5.6-luna | `ultra` | 0 | `raw/gpt-5.6-luna-ultra.*` |
| gpt-5.6-terra | `high` | 0 | full review dispatch, `development-records/benchmark/reconciliation-review-r2/terra-high/` |
| gpt-5.6-sol | `max` | 0 | full review dispatch, `development-records/benchmark/reconciliation-review-r2/sol-max/` |
| gpt-5.6-luna | `high` | 0 | full review dispatch, `development-records/benchmark/reconciliation-review-r2/luna-high/` |
| gpt-5.5 | `none`, `xhigh` | 0 | `raw/codex_cli-gpt-5.5-{none,xhigh}.*` |
| gpt-5.5 | `max` | **1** | `Invalid value: 'max'. Supported values are: 'none', 'minimal', 'low', 'medium', 'high', and 'xhigh'.` |
| gpt-5.5 | `ultra` | **1** | `raw/codex_cli-gpt-5.5-ultra.err` — rejection names **'max'**, not 'ultra' |
| gpt-5.5 | `minimal` | **1** | `The following tools cannot be used with reasoning.effort 'minimal': web_search.` |

### gpt-5.5 stops below the GPT-5.6 levels

`max` and `ultra` are GPT-5.6-era levels — max deepens a single agent, ultra runs
sub-agents in parallel — and gpt-5.5 has neither; its ceiling is `xhigh`, which is
exactly the set measured here. Worth noting for whoever reads the raw file: asking
5.5 for `ultra` produces a rejection naming **`max`**, so a request for ultra
resolves to max somewhere below this harness for a model that lacks it. The
resolution point is not established by anything measured here, and the authority
does not assert one — it records that this surface refuses both for 5.5 and
accepts both for 5.6.

`minimal` on gpt-5.5 is refused for an unrelated reason worth not conflating: it
is a valid enum value that this surface's tool set forbids (`web_search`), not an
unknown one. The authority leaves it out either way — the entry records what the
surface accepts as configured — but the provenance says which kind of refusal it
was.

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
| claude-opus-4-8 | `ultracode`, `xhigh` | 0 | none | accepted |
| claude-sonnet-5 | `ultracode`, `xhigh` | 0 | none | accepted |

`ultracode` was accepted on every model probed (opus-5, opus-4-8, sonnet-5,
haiku-4-5), so it reads as a CLI-level value rather than a model-gated one.

¹ The stderr on these two rows carries only an unrelated `no stdin data received`
warning, not an effort warning.

The haiku rows matter because the Anthropic API documents effort as **unsupported**
on Claude Haiku 4.5 — the CLI does not surface that restriction. Hence the split
in the authority file: `anthropic_sdk` + `claude-haiku-4-5` is an empty set, while
`claude_code` + `claude-haiku-4-5` carries the `--help` enum.

## Not probed

- `ultracode` on `claude-fable-5` — under a monthly spend limit in this environment.
- Direct-API (`openai_sdk` / `anthropic_sdk`) acceptance for any model: no metered
  credential exists here, and every seat in this install is `auth: oauth`, so those
  surfaces are never dispatched on from this repo. Their entries rest on vendor
  documentation and are marked `verification: documented`.

Both gaps are structural in the authority (`verification` + `evidence_ref`) rather
than prose, and a test pins the documented-only set so a new one cannot be added
quietly. Closing either is one harness run — the direct-API surfaces additionally
need a metered key, which the harness refuses to fake.
