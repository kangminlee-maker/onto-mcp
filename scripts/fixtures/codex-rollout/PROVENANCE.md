# codex rollout fixtures — provenance

Three **real** codex rollout transcripts from 2026-07-27, copied line for line from
`~/.codex/sessions/2026/07/27/` by `scripts/build-codex-rollout-fixture.mts`. They are the subject the
delivery-reconciliation rollout reader parses (design
`20260727-observation-pull-layer-redesign/11-implementation-design-delivery-reconciliation.md` §6,
measurement `20-measurement-rollout-record-structure.md`).

They are committed because codex does not document this artifact, and a fixture written from a
description would only prove the reader matches the description. Regenerate or verify with:

```
npx tsx scripts/build-codex-rollout-fixture.mts          # rewrite from ~/.codex
npx tsx scripts/build-codex-rollout-fixture.mts --check   # drift gate: fail if they differ
```

`--check` only works on a machine that still holds the original sessions. These copies are the durable
record; `~/.codex` is not.

## What was replaced, and why

Every record the reader touches — `session_meta`, `event_msg`/`mcp_tool_call_end`,
`response_item`/`custom_tool_call_output` — is **byte-preserved**, so these fixtures can also carry
stage 2's verbatim-containment checks. Replaced (~132 KB per file, none of it read by the reader):

| Location | Reason |
|---|---|
| `session_meta.payload.base_instructions` | the Codex system prompt — a vendor text |
| `world_state.payload.state` | environment snapshot embedding this machine's rendered AGENTS.md |
| message text `# AGENTS.md instructions for…` | that rendering includes a private global instruction bundle the repository's own committed `AGENTS.md` does not contain (checked: no `agent-bios:central` marker in it) |
| message text `<skills_instructions>` / `<plugins_instructions>` | the skills and plugins installed on this machine |
| message text `<permissions instructions>` / `<environment_context>` | vendor sandbox text; cwd, shell, timezone |

What remains beyond the machine-readable records is the probe prompt and the model's probe answers —
the measurement content itself.

## What each session contributes

The reason a session is here is the PHASE it carries. A replacement must reproduce it.

| session (prefix) | sent | recv | exec | max MCP calls in one exec | truncated recv | phase |
|---|---|---|---|---|---|---|
| `019fa332-ae9e` | 4 | 2 | 2 | **4** | 1 | four MCP calls in ONE exec, all four results rendered into one output and truncated — **the sequence reviewer F1 predicted, measured**: ordinal pairing of 4 sent against 1 output is immediately wrong |
| `019fa334-7926` | 4 | 3 | 3 | **4** | 0 | four MCP calls in ONE exec whose output is `done`, then a LATER exec runs `load("probe2"); text(…)` — **one payload reaches context turns after the call that produced it, three never do**. A rule that pairs a sent record with "its" output, or that reads only the calling exec's output, is wrong in both directions here |
| `019fa33f-3382` | 1 | 2 | 2 | 1 | 1 | one MCP call in one exec, plus an exec that calls no tool at all |
| `019fa8af-6551` | 1 | 2 | 2 | 1 | 0 | **the real `onto_observation` façade**, and the only transcript here where the model SPEAKS BEFORE it fetches — interim commentary at record 9/10, tool outputs at 12 and 17, accepted answer at 20+. A boundary rule that takes the earliest answer marker places it at 9 and discards both outputs (measured: `delivered` went from two observations to none) |

`sent` = `event_msg`/`mcp_tool_call_end`, `recv` = `response_item`/`custom_tool_call_output`.
Note that `sent` and `recv` counts do **not** match in any of them: an exec that calls no tool
still produces a received record. §11-L1's bidirectional check cannot be a naive count comparison.

## Phases NOT covered

`session_meta.cli_version` is `0.145.0` in all four. The first three carry a synthetic `probe`
server; `019fa8af-6551` carries the real `onto_observation` façade, so "anything from the real
façade" is **no longer** a missing phase — that gap closed on 2026-07-30, and it closed by finding a
live regression the synthetic three could not have caught.

Still missing: **concurrent calls** (`Promise.all`), **multiple `text()` calls**, **overlapping outer
execs**. Those three were closed by ARGUMENT rather than by capture on 2026-07-30 — the judgment
reads none of the axes they vary (no `call_id` pairing, multiset comparison, order-independent fold),
and that irrelevance is pinned by test. See design `20-…md` §2.
