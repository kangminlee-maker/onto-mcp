# Backlog — metered-billing defaults outside the runtime policy boundary

**Opened**: 2026-07-27
**Owner decision**: backlog (not fixed in the llmOverride seat-guard work)
**Source**: cross-family review (OpenAI/Codex lenses B, C, D) of the per-call
`llmOverride` fail-closed patch; see
`development-records/audit/20260727-llm-override-consumer-findings.md`.

## The rule these violate

The runtime policy set with that patch: **metered (`per_token`) billing is only
ever chosen explicitly.** A seat states it with `auth: "api_key"` or by naming
the `api_key_env` it calls the paid API with; an omitted auth resolves to the
provider's subscription worker route. Enforced in
`src/core-runtime/llm/model-switcher.ts` (`defaultAuthForProvider`) and pinned by
`model-switcher.test.ts`.

That rule binds the product runtime. The items below sit in harness/CLI code that
the rule does not currently reach.

## B1 — `scripts/m3-run.ts` defaults an omitted `--judge-auth` to `api_key`

`scripts/m3-run.ts:589` assigns `"api_key"` when the flag is omitted, and
`scripts/m3-attribution-judge.ts:183` then dispatches without the `claude_code`
adapter, so every judge request goes through the Anthropic SDK. The default
matrix is 3 fixtures × 8 judge runs, so a plain `npx tsx scripts/m3-run.ts` with
`ANTHROPIC_API_KEY` exported performs ~24 metered calls that the operator never
asked for. Printing `(api_key)` after the choice is made does not make it
explicit.

Reported independently by three review lenses (severity high/medium).

**Why it is deferred, not fixed**: changing the default changes what past M3
benchmark records mean — the comparison basis for the defect-spectrum work is
`anthropic api_key` judge dispatch. Flipping the default to `oauth` (or making
the flag required) is a bench-methodology decision, not a bug fix, and belongs
with whoever owns that benchmark's continuity.

**Options when picked up**:
1. Require `--judge-auth` explicitly (no default) — loudest, breaks existing
   invocation lines.
2. Default to `oauth` and record the basis change in the M3 design record.
3. Keep the default and state it in the harness docs as an accepted metered
   surface, with the runtime rule explicitly scoped to product code.

**Done when**: an omitted `--judge-auth` cannot start a paid run, or the harness
docs state the metered default as a deliberate, recorded exception.
