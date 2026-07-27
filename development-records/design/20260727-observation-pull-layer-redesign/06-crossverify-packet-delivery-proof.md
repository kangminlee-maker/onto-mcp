# JUDGEMENT TASK — where does a delivery proof belong, given a transport that removes middles?

You are judging a design question, independently. Another party has an opinion; you are deliberately not
being told it. Reach your own conclusion and say plainly if the question itself is malformed.

Repository (read-only, optional): `/Users/kangmin/Documents/onto-mcp`, branch
`feat/observation-grant-stage2`. Existing code: `src/core-runtime/reconstruct/observation-read*.ts`.
The packet is self-contained; reading code is allowed but not required.

**Independence constraint — binding.** Do NOT open any other file in
`development-records/design/20260727-observation-pull-layer-redesign/`. That directory holds the two
drafts this packet summarises and another party's conclusion about the very question you are being asked.
Reading them would convert your judgement into agreement. Everything you need is in this packet. Source
code under `src/` is fine to read.

## THE SYSTEM

A runtime drives an LLM worker (OpenAI's `codex` CLI, non-interactive) to author a JSON artifact. The
artifact's evidence clusters cite **source observation ids** — ids of text excerpts the runtime collected
from a real corpus.

The prompt cannot carry the excerpts: citing all 59 observations of one real corpus is 1,328,185
characters against a provider ceiling of 1,048,576. So the prompt carries a **navigation catalog** (ids,
source refs, one-line summaries, no content) and the worker **fetches** the detail it wants through an
MCP tool the runtime serves.

That creates the accounting problem the layer exists for:

> A worker looking at a catalog of ids can cite any of them without ever reading one. The citation is
> syntactically well-formed and evidentially empty.

So after the worker exits the runtime must be able to state exactly which observations it served, and
refuse any citation outside that set:

    cited observation ids ⊆ ids actually served ⊆ a snapshot fixed at dispatch time

The layer is opt-in, OFF by default; with it off the dispatched bytes must be unchanged.

## THE MEASUREMENT THAT PROMPTED THIS QUESTION

Freshly measured against codex-cli 0.145.0 with the real command and hardening flags, `gpt-5.6-luna`,
one real dispatch per row. `[#........]` maps whether each of 9 evenly spaced probe points inside one
tool result reached the model. Probe points are random values that cannot be inferred from the pattern.

| result size (chars) | `tool_output_token_limit` | survival map | outcome |
|---|---|---|---|
| 32,035 | default (unset) | `#########` | intact |
| 65,553 | default (unset) | `###...###` | 3 of 9 points lost |
| 128,049 | default (unset) | `##.....##` | 5 of 9 points lost |
| 32,035 | 1000 | `#.......#` | 7 of 9 points lost |

Established facts:

1. **codex removes the MIDDLE of an oversized tool result and keeps both ends.** Every observed
   truncation has the shape `head … tail`.
2. **The runtime cannot observe this.** Truncation happens inside codex, between the MCP server and the
   model. The server emits whole bytes and never learns they were trimmed.
3. **The worker does not reliably surface it.** codex appends a banner (`…6825 tokens truncated…`,
   confirmed once), but in every positional measurement the worker reported no banner — including a run
   where 7 of 9 probe points were provably absent. Worker self-report is not a usable signal.
4. **The ceiling is configurable.** `tool_output_token_limit` is a real top-level config key settable via
   `-c`, so the runtime can declare it rather than discover it. Measured downward (1000) only; whether it
   can be raised is not measured.
5. The real unit is **tokens**, not characters, so the character bracket above shifts with corpus
   tokenization.

## WHY THIS UNSETTLES THE TWO EXISTING DESIGNS

Two independent architectures were drafted from a shared blind packet. Both converged on proving delivery
by requiring a value that can only be held if the response arrived — rather than by ordering a receipt
against a stream write. Both then placed that value **in the served response**:

- design 1 mints a random token when an observation's coverage completes and includes it in that
  response; a citation is valid only if it carries the token.
- design 2 returns an opaque one-use challenge with each chunk; the chunk is committed only when a later
  call returns that challenge.

Under fact 1, a value riding at the end of a response survives precisely the case it is meant to exclude:
the body is removed, the value arrives, and the worker can present it for content it never received.

## THE QUESTION

Where, and in what form, should the delivery proof live so that holding the proof implies having received
the body — under a transport that may remove the middle without telling either side?

## CANDIDATE DIRECTIONS

Presented in no significant order, each stated at its strongest. They are not exhaustive; propose better.

**A — Stay below the ceiling.** The runtime sets `tool_output_token_limit` explicitly and sizes chunks
with margin so a result is never large enough to be trimmed. The proof stays where the drafts put it.
Truncation becomes a condition the design arranges never to reach.

**B — Prove every region.** The response carries a distinct random value in each of several regions of
the body. The worker must return all of them; a complete return is the delivery record. Partial returns
name exactly which regions arrived.

**C — Derive the proof from the body.** The proof is not carried in the response at all. It is a value
the worker can only produce by having the whole body — for example a digest over the body, or an answer
to a question whose response is determined by content spread through it.

**D — Make the trim visible to the runtime.** Add a step in which the worker reports a property of the
result as received (its length, or a hash of it), which the runtime compares against what it emitted.
Delivery is accepted only when the two agree.

**E — Retire the proof.** Define "served" as "emitted", and constrain elsewhere: for instance admit only
observations small enough that a result is atomic with respect to trimming, and treat anything larger as
uncitable.

## HOW TO JUDGE

For each direction you assess:

1. **Soundness under fact 1.** Does it make incorrect acceptance — a citation for a body the worker did
   not receive — *unrepresentable*, *reduced to one checked place*, or *left open*? Say which plainly.
2. **Durability.** Fact 1 is one version's behaviour. Does the direction still hold if the trimming
   policy changes shape (head-only, tail-only, different threshold) or if the ceiling moves?
3. **Cost to a worker acting in good faith.** Extra calls, values to copy accurately, context consumed,
   and what happens to a worker that read everything but reproduced a value imperfectly.
4. **Concept economy.** How many concepts does it add, and in how many places does its rule end up
   declared? A rule expressed once beats a rule maintained by convention in several places.
5. **What it still assumes that has not been measured**, and the probe that would settle each.

## DESIGN PRINCIPLES THIS CODEBASE HOLDS

You do not load these; they are given.

- **Capability boundary.** Instructions carry semantic work; the capability surface carries structural
  constraints. When a behaviour must not happen, make it unavailable, invalid or unaccepted rather than
  prohibited. Deterministic work — parsing, counting, hashing, validating — belongs in code, and the
  runtime may enforce a contract but must never reason about or repair a deficient result.
- **Concept economy.** Before adding a concept, find the nearest existing one and choose explicitly:
  reuse, extend, rename or split. Minimise the number of PLACES one rule is declared. Derived values stay
  projections of their source.
- **Staged, minimal, reversible.** Smallest viable path meeting the completion criteria; behaviour-
  changing work lands behind a default-off path that preserves current behaviour when off.
- **Falsifiable verification.** Completion criteria must be signals that fail when the mechanism is
  wrong. A green check counts only if it traversed the real path. In this codebase a wiring assumption
  that passed 26 in-process tests died on the first real worker run.

## OUTPUT FORMAT

```
PREMISE CHECK
<is the question well-formed? if the framing is wrong, say so and why — this section may be the whole answer>

PER-DIRECTION VERDICT
<A..E and any you add: soundness verdict, durability, honest-worker cost, concept economy, unmeasured assumptions>

RECOMMENDATION
<what you would build, concretely — the shape, what crosses which boundary, in what form>

WHAT YOUR RECOMMENDATION DOES NOT SOLVE
<plainly>

REQUIRES MEASUREMENT
<each capability you depend on that is not an established fact above, and the probe that settles it>
```
