# Per-call `llmOverride` — findings from an external consumer

**Filed**: 2026-07-27
**Against**: onto-mcp **0.4.17**, as installed at
`/opt/homebrew/lib/node_modules/onto-mcp` (globally installed build, not this worktree)
**Reporter**: the `agent-bios` launcher, which injects an `onto_review` /
`onto_prepare_review` call with an `llmOverride` into an agent's launch contract so a
review runs on a *different model family* than the session it is reviewing.
**Status**: findings only — no onto code was changed. Every claim below was measured
against the installed build with pure functions; **no billed provider call was made.**

## Why this consumer is a useful probe

agent-bios uses `llmOverride` for one purpose: to make a review demonstrably
*independent* of the model being reviewed. That makes it unusually sensitive to a class
of behaviour that is otherwise benign — an override that is partially applied, silently
ignored, or applied to a different route than requested does not merely mis-configure a
run, it **falsifies the independence claim while reporting success**. Three of the four
findings below are invisible to a caller who only checks that the call succeeded.

Each finding states an input, the branch it takes, and the observable wrong behaviour.

---

## F1 — an override is silently a no-op on any seat with no explicit `llm` block (high)

**Input.** A minimal user settings file — the shape a new user has:

```json
{ "schema_version": "settings.json/v3", "review": { "mode": "full" } }
```

…plus any override at all, e.g. `{provider:"anthropic", model:"claude-fable-5",
auth:"oauth", effort:"max"}`.

**Branch.** `resolveSettingsChain` is a pure projection and does **not** populate seat
`llm` blocks, so `review.execution.{teamlead,lens,synthesize}` resolve with no `llm`.
`applyReviewLlmOverride` skips exactly those: `if (actor?.llm)` for actors, and
`if (!unit.llm) { nextUnits[unitId] = unit; continue; }` for units
(`dist/core-runtime/discovery/llm-override.js`).

**Observable wrong behaviour.** Measured on the minimal file above: 3 actor seats resolve
with `<NO llm block>`, `units` is absent entirely, and after a full four-field override
all three actors come back **UNTOUCHED**. The call succeeds. Nothing is logged, no field
records that the override was dropped, and the returned settings are the input.

A caller that pinned a provider to obtain cross-family review gets a review on whatever
the unconfigured default resolves to, and is told nothing. For agent-bios this is a
family collapse with no signal — precisely the failure our review-independence work
exists to make visible.

**The gate that could have caught it passes vacuously.** `review-invoke.js:2081` runs
`assertSettingsModelsSupported` on the *post*-override config, scoped to review seats, and
only when an override is present — the ordering and scoping are right. But on this input
`ontoConfig.review` is `{mode:"full"}`, so the gate walks **zero seats** and passes.
An empty subject set satisfies "every seat is supported" by construction.

**What would resolve it.** Any of: populate seat defaults during resolution so the overlay
has something to land on; apply the override to seats that resolve by inheritance rather
than only to explicitly-configured ones; or return a report of which seats the override
actually reached, so a caller can fail closed on zero. The last is cheapest and is the one
that makes the other two verifiable.

---

## F2 — a provider switch silently changes the billing route (medium)

**Input.** `{provider:"anthropic", model:"claude-fable-5"}` against seats configured for
`openai`/`oauth`.

**Branch.** The provider differs, so `applyLlmBlockOverride` takes REPLACE and returns
`{...override}`. The old block is dropped entirely — correct, since transport must not
leak. But the override carries no `auth`, so `normalizeLlmModelSwitcher` falls back to
`defaultAuthForProvider(provider)`, which is `api_key` for anthropic and `oauth` for
openai (`dist/core-runtime/llm/model-switcher.js:15-21`).

**Observable wrong behaviour.** Measured through `resolveSettingsChain` →
`applyReviewLlmOverride` → `normalizeLlmModelSwitcher`:

| override | resulting `billing_mode` | `auth` |
|---|---|---|
| `{provider:"anthropic", model}` | **`per_token`** | `api_key` |
| `{provider:"anthropic", model, auth:"oauth"}` | `subscription` | `oauth` |
| `{provider:"openai", model}` | `subscription` | `oauth` |

So the *same minimal override shape* is subscription-billed on one provider and
metered-billed on the other. A caller switching providers to compare two families pays
per token on exactly one arm of the comparison, with nothing in the call or its result
saying so. This was a live defect in agent-bios for as long as the instruction existed;
we fixed it caller-side by always stating `auth`.

Note this is *not* an argument against REPLACE, which is right. It is an argument that
**billing mode is too consequential to be a defaulted, unreported side effect of a field
the caller omitted.** Reporting the resolved `billing_mode` back to the caller would have
made it self-correcting.

---

## F3 — a provider switch silently discards per-unit effort tuning (medium)

**Input.** The same `{provider:"anthropic", model}` override, against a settings file that
tunes units individually — 10 units carrying `{model, effort}` (9 `medium`, 1 `low`) under
3 actors.

**Branch.** In REPLACE mode each unit's `llm` is dropped so it inherits the replaced actor
("no stale unit model on the old provider" — a sound reason).

**Observable wrong behaviour.** Measured: 13 seats collapse to 3, and every configured
effort is gone. The caller cannot express "switch the provider, keep my per-unit efforts",
because the only way to restore an effort is a single override-level `effort`, which then
flattens all seats to one value — the opposite tuning. Both outcomes are silent.

Deliberately *not* claimed: that dropping the unit model is wrong. The gap is that
provider identity and per-unit rigour are welded into one decision, so a caller must lose
one to change the other.

---

## F4 — `supported-models.yaml` contradicts the code it describes (documentation)

Its header states:

> Review-side runtime enforcement is a noted follow-up, so the runtime gate is wired on
> the reconstruct live path only today.

`review-invoke.js:2081` calls `assertSettingsModelsSupported` on the review path, and its
own comment calls it "the one new review-side model-support gate". The header is stale.

This is low-impact but it actively misled this investigation: read alone, it says an
override can introduce an unsupported model on the review path unchecked, which is false —
the gate runs after the overlay and is scoped to review seats. Worth one line to correct,
because the file is the declared authority and its header is what a reader trusts.

---

## What was checked, and what was not

Checked, on the installed 0.4.17 build:

- `dist/core-runtime/discovery/llm-override.js` — the full REPLACE / route-cleaned /
  OVERLAY decision, actor and unit paths, salvage transcription.
- `dist/core-runtime/llm/model-switcher.js` — `defaultAuthForProvider` and the auth
  validation rules (`oauth` only for openai/anthropic; `local` only for lmstudio).
- `dist/core-runtime/cli/review-invoke.js:2061-2081` — the real call site: resolution,
  overlay, then the override-scoped support gate.
- Live behaviour against both a fully-configured settings file (13 seats) and a minimal
  one (0 seats), with a negative control confirming the pre-fix override shape still
  reproduces `per_token` — so the measurements are not vacuous.

**Not** checked, and therefore not claimed:

- What a review *actually dispatches* when the override is dropped (F1). Only that the
  override does not reach the seats and nothing reports it.
- Whether `grok`/`lmstudio` review bindings fail at dispatch. They have no entry in
  `supported-models.yaml`, but the review-side gate is override-scoped, so the failure
  path was not established. An earlier consumer-side note asserting they "fail at review
  time, every time" is **not** supported by anything measured here.
- Anything about the reconstruct path beyond the shared override helpers.
- Any behaviour of this worktree's branch (`feat/observation-grant-stage2`), which was not
  built or read; findings are against the installed build only.

## Suggested order

F1 first: it is the only one that can make a successful call mean nothing, and a
seats-reached report would give F2 and F3 somewhere to surface too.

---

## Disposition (2026-07-27, onto-mcp side)

Every finding was re-measured against this repo's SOURCE (branch
`feat/observation-grant-stage2`, also 0.4.17) with pure functions and the real
`resolveReviewInvokeSetup` seam — no billed provider call. All four reproduce.
What changed, and what deliberately did not:

**F1 — fixed (fail-closed).** The overlay now returns a seat report alongside the
settings (`applyReviewLlmOverrideWithReport` / `applyReconstructLlmOverrideWithReport`,
one implementation so report and effect cannot disagree), and
`assertLlmOverrideReachedSeats` throws `llm_override_reached_no_seat` when an
override reaches zero seats — at the review invocation seam before the
supported-model gate, and at the reconstruct live boundary beside it (mock
realization exempt: it dispatches to no provider). The report's `reached` /
`dropped` lists plus the resolved route's `billing_mode` are disclosed on the
review runner's warning channel, so they surface as `environmentWarnings` in
every `onto_review_read` projection and in the `onto_prepare_review` result.

The guard counts PRIMARY dispatch seats only. Recovery-only seats (salvage
transcription, reconstruct `dispatch_fallback`) are reported separately, because
counting them reopened the very hole: cross-family review dispatched on
`codex/codex` with no model pin while a salvage-configured chain satisfied the
guard — measured, then closed, then re-measured.

Two things this investigation left open are now established:

- *What a review actually dispatches when the override is dropped.* It does not
  fail. With no configured seat the profile resolves to `codex/codex` on local
  codex availability alone, with `model=null` (worker default) — the family
  collapse was real, not hypothetical. Without codex the run fails `no_host`.
- *The vacuity was internally inconsistent.* `collectEffectiveModelRoutes`
  deliberately fails loud on a HALF-configured seat because it would otherwise
  dispatch `(provider, worker-default-model)` unverified — yet a fully
  unconfigured seat set produced exactly that and passed. Measured contrast: a
  `grok` override throws on a configured chain and passed on a minimal one.

**F2 — fixed at the authority: an omitted `auth` can no longer select a metered
route.** The first disposition of this finding was to disclose rather than block,
on the reasoning that the auth default is settings parity (v4 §2.2). The owner
rejected that framing, and correctly: both providers that offer a subscription
route are used on subscription, so `api_key` was never the right default for
*either* — the defect was in `defaultAuthForProvider`, not in the override path
that merely inherited it. Metered billing charges on the first call, so it is a
choice the caller states, not one a default makes for them.

`defaultAuthForProvider` now returns the subscription route (openai →
`codex_cli`, anthropic → `claude_code`) when a block omits `auth`. Metered
billing stays reachable two ways, both of them a WRITTEN statement by the seat:
`auth: "api_key"`, or naming the `api_key_env` this seat calls the paid API with.
Reading that field is not the inference INV-AUTH-1 bars — that rule forbids
deriving auth from a secret being PRESENT in the environment, which is a
different act from honoring a configuration field the author typed. The MCPB
bootstrap keeps deriving from `{provider, model}` alone for exactly that reason:
there the credential env name would come from this code noticing a key value at
install time, so an installer that wants the paid route states
`ONTO_BOOTSTRAP_AUTH=api_key`. grok keeps `api_key` because it has no
subscription route at all; lmstudio stays `local`.

Two consequences worth stating plainly. An openai seat that names an
`api_key_env` but omits `auth` used to resolve to the Codex subscription worker
(the key was inert) and now resolves to the paid API — the seat's own
declaration, honored consistently across providers rather than only for
anthropic. And an anthropic seat that states neither now resolves to the Claude
Code worker; if that worker is not installed the run fails loud rather than
falling through to a metered call.

Blast radius, measured: the first cut of this change failed the suite in exactly
ONE place — the test pinning the old default — and a second cut, which ignored
`api_key_env` entirely, failed one more: the bootstrap test that pins
loader-consistent derivation. Both are now pinned to the final rule, with the
metered paths as contrast cases. Parity with settings is preserved, because the
settings path resolves through the same function.

Two corrections to the finding as filed still stand: (a) the billing mode was not
entirely unreported — it is recorded in `resolved_llm_plan.billing_mode` and
`routeVisibility.actorProfiles[].billingMode`, though only after the run starts;
the F1 disclosure line adds the call-time signal, and now names the effective
auth and whether it was defaulted. (b) A REPLACE cannot carry `api_key_env` (the
schema excludes transport), so an override that switches to anthropic without
stating auth now lands on the Claude Code worker — and when that worker is not
installed the run fails loud instead of falling through to a metered API call.

**Adjacent blocker surfaced by cross-family review: the subscription label was
not enforced.** Making `claude_code` the default anthropic route widened the
blast radius of a pre-existing hole. Both Claude worker spawns
(`claude-code-review-unit-executor.ts`, `llm-caller.ts`) called `spawn()` with no
`env`, so the child inherited the whole parent environment — and Claude Code's
documented precedence puts cloud selectors, `ANTHROPIC_AUTH_TOKEN` and
`ANTHROPIC_API_KEY` ABOVE the logged-in session, with an ambient key ALWAYS used
in non-interactive `-p` mode. No flag forces the subscription; removing the
variables is the only supported control. So `billing_mode: "subscription"` and
the comment claiming "no ANTHROPIC_API_KEY" were assertions the code did not
enforce, and a run could spend API credits while every artifact said otherwise.
`claudeOauthWorkerEnv` now strips those credentials (plus the seat's own
configured credential env) from both spawns; `CLAUDE_CODE_OAUTH_TOKEN` is kept
because it is itself an OAuth credential. The declaration is now enforced by
construction rather than documented.

**Adjacent defect surfaced and reproduced: the executor child re-resolved the
route and lost the stated auth.** The direct-call executor
(`inline-http-review-unit-executor`) runs as a spawned child that re-reads
settings from DISK, while the parent passes its EFFECTIVE (post-overlay) route as
flags. `resolveLlmProviderConfig` normalized the settings block FIRST and then
patched CLI scalars onto the result — but `auth` is an input to normalization,
not an output field, so `--auth` was parsed, validated, and dropped, leaving the
adapter to come from the on-disk block.

Reproduced through the real functions: disk `anthropic/oauth` +
`--provider anthropic --auth api_key --model claude-fable-5` resolved to
`execution_adapter: "claude_code"`, and `callLlm` dispatches on
(provider anthropic + adapter claude_code) — so a caller who explicitly requested
the metered API route would run on the Claude Code subscription worker while the
baked actor profile recorded the API route. Not an overspend, but exactly the
"believe X, run Y" failure the override contract forbids, and it falsifies the
recorded evidence of which route produced the review.

Fixed structurally: CLI route fields are merged into the block and normalized
ONCE (`normalizeCliAwareSelection`), so `auth` lands where the decision is made.
Inheritance follows the same rule the per-call overlay uses on a route change —
`service_tier`/`base_url` never cross a stated route, `api_key_env` crosses only
into a direct-call destination, `auth` only when the provider is unchanged — and
the legacy `provider: "codex"` dispatch key keeps its settings-only path.
Measured blast radius before changing it: exactly ONE caller passes
`cliOverrides` (the executor), and nothing passes `service_tier` through it.

**Adjacent defect fixed: the disclosure rode a process-global transport.**
Runner warnings were carried by save/restore of `console.warn`, which is only
correct under strict LIFO nesting. The runtime deliberately overlaps invocations
— `runReview` returns a running handle while `fullRun` continues in the
background, and the MCP server accepts the next call meanwhile — so B (started
during A) captured A's warnings into B's session, and A finishing first
uninstalled B's capture while B was still running. That was tolerable while the
channel carried unit stderr noise; this work put an authority claim on it (seats
reached, resolved billing route), turning mis-attribution into false session
evidence. The channel is now an `AsyncLocalStorage` collector scoped to each
invocation, and the artifact is written from the collected messages rather than
by re-parsing captured console output — the prefix survives only as the
display mirror. Pinned by an interleaving test that fails against the previous
global-sink transport.

**F3 — no change, by design.** A unit `llm` is a partial block merged over its
actor, so surviving a provider switch would make the effective route
`anthropic/gpt-5.6-sol`. Measured counterfactual (units kept): all 10 unit routes
become `anthropic/gpt-5.6-sol`, the profile's model pin collapses to `null`, and
the supported-model gate rejects the run — the drop is what makes a
cross-provider override work at all with per-unit models. The scope of the drop
was already narrowed once (`bc78b8b`, 2026-07-15) so only a genuine provider
switch drops a unit, not an override that merely restates the provider. The
finding's own framing — that the gap is expressiveness and silence, not the drop
— is accepted; the silence half is closed by the disclosure line.

**F4 — fixed, in three places.** The stale claim lived in the declared authority
header AND in the gate function's own TSDoc (`settings-chain.ts`), both written
`64f8b47` (2026-06-15) and left unrevised when the review-side gate landed in
`2c48c0f` (2026-07-14). A third statement of the same class — the tool-schema
comment asserting the overlay applies to "every review dispatch seat (all actors
+ units)" — was false for unconfigured seats and is corrected; the advertised
tool description now states the fail-loud.

Both invocation entrypoints now deliver it: `onto_prepare_review` returns the
captured runner warnings through the same artifact writer the run path uses,
instead of discarding them.
