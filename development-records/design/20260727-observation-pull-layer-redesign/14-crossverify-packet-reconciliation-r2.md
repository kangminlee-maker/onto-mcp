# REVIEW TASK — an implementation design that derives delivery from the worker CLI's own transcript

You are reviewing a design before it is built. Judge it; do not rewrite it into your own preference
unless you can say concretely what breaks.

Repository (read-only): `/Users/kangmin/Documents/onto-mcp`, branch `feat/observation-grant-stage2`.
Relevant code: `src/core-runtime/reconstruct/observation-read*.ts`.

**Independence constraint — binding.** Do NOT open any file in
`development-records/`. That tree holds prior drafts, an earlier review round, and the author's own
conclusions on this exact question; reading them converts review into agreement. Everything needed to
judge is in this packet. Source under `src/` is fine and is where you should check claims.

## THE SYSTEM

A runtime drives an LLM worker (OpenAI's `codex` CLI, non-interactive) to author a JSON artifact whose
evidence clusters cite **source observation ids** — ids of text excerpts the runtime collected earlier.

The excerpts cannot ride in the prompt: citing all 59 observations of one real corpus is 1,328,185
characters against a 1,048,576 ceiling. So the prompt carries a navigation catalog (ids, refs, one-line
summaries) and the worker **fetches** detail through an MCP tool the runtime serves from its own process.

The accounting problem: a worker looking at a catalog can cite any id without reading one. So after the
worker exits the runtime must state exactly which observations were delivered, and refuse citations
outside that set:

    cited ids ⊆ delivered ids ⊆ a snapshot fixed at dispatch time

The layer is opt-in, OFF by default; with it off the dispatched bytes must be unchanged.

## MEASURED FACTS (this repository, codex-cli 0.145.0, real dispatches)

1. **Results are trimmed on the way to the model, middle-out.** A result of 65,049 chars loses interior
   regions while both ends survive. 32,035 chars survives intact. Probe points are random values placed
   at intervals; survival is read from which ones the model can report.
2. **The runtime cannot see the trim.** It happens inside codex after the MCP server has written whole
   bytes. The server never learns.
3. **The worker does not reliably report it.** codex emits a banner, but in every positional measurement
   the model reported none — including a run where 7 of 9 probe points were provably absent.
4. **`tool_output_token_limit` is a real config key settable via `-c`.** It lowers the ceiling; setting it
   to 200000 did not raise it (a 128,049-char result trimmed identically to default).
5. **The model does not call MCP tools directly.** codex does not advertise them; the model reaches them
   from inside codex's JavaScript `exec` tool, e.g. `tools.mcp__<server>__<tool>({...})`. The result is
   therefore rendered through that tool's output, and it is that output which is trimmed. The trimmed
   output carries the literal text `Warning: truncated output (orig…`.
6. **codex writes a per-session transcript** ("rollout") at `~/.codex/sessions/<date>/rollout-<ts>-<uuid>.jsonl`.
   Measured on two independent runs, it contains BOTH:
   - `event_msg` / `mcp_tool_call_end` — the MCP server's raw result, with
     `invocation: {server, tool, arguments}`. Contains ALL probe points (pre-trim).
   - `response_item` / `custom_tool_call_output` — what entered the model's context. Contains exactly
     the probe points the model reported and none of the lost ones (post-trim). Length ≈40,490 chars in
     both runs. **Both runs are one-MCP-call-per-`exec` topology.**
7. **The dispatch can be bound to its transcript.** codex prints `session id: <uuid>` on stderr (the
   runtime already captures the child's stderr). The filename embeds that uuid, and the first record
   (`session_meta`) carries `session_id`, `cwd`, `cli_version`, `git.commit_hash`, `git.branch`.
8. **The model cannot reach the filesystem** (worker runs with `--disable shell_tool`; codex's JS tool is
   a V8 isolate with no fs). It cannot write or alter the transcript.
9. Trimming appears **non-deterministic**: two harnesses at identical size and limit produced trimmed and
   intact results respectively.

## EXISTING CODE THE DESIGN BUILDS ON (verify these, they are load-bearing)

- `observation-read-facade.ts:511` — what the MCP server returns to the worker is
  `content: [{ type: "text", text: JSON.stringify(page) }]`, with the same object also on
  `structuredContent`.
- `observation-read.ts:178-204` — that page object carries `snapshot_digest`, `entries[]`
  (`observation_id`, `observation_content_sha256`, `part_index`, `part_count`, `part_allowance`, `body`)
  and `next_cursor`.
- `observation-read.ts:518` — `splitBodyByJsonCost(body, allowance)`; the split is a pure function of
  `(body, allowance)` and the allowance is derived from the REQUEST's id list.
- `observation-read-grant.ts:663-686` — the accumulator that folds served pages into the delivered set.
  It merges part indexes only within one `part_allowance` and drops earlier indexes when the allowance
  differs. This rule currently exists **inline** in that loop.
- `observation-read-facade-server.ts:114` — the server calls `session.commit()` after each response's
  bytes are on the wire, which durably writes the receipt.
- `observation-read-facade.ts:766` — the receipt reader is fail-closed: missing file, torn JSON, wrong
  schema version, or a launch token that is not this launch's all return null, and the caller must read
  null as "nothing was served".

## THE DESIGN UNDER REVIEW

**During the dispatch.** The MCP server records `emissions`: for each response, the **exact string it
sent** — the `JSON.stringify(page)` bytes above, verbatim, not a digest and not a reconstruction. This is
an input to a later decision, not a claim about delivery. It is written to a schema of its own that the
receipt reader cannot accept. **The server no longer writes a receipt at all.**

**After the worker exits**, the runtime, in its own process:

1. reads the session id from the child's stderr, requiring **exactly one** CLI-origin banner (zero or
   more than one ⇒ unverifiable); requires the rollout's creation time to fall inside the child's
   lifetime window and the canonical `cwd` and `session_meta` to match;
2. checks `cli_version` against a verified list AND validates the transcript's structure at runtime —
   record kinds, field types, where the post-trim payload sits;
3. parses the JSONL envelopes and inspects **only the actual output payload** of post-trim records;
4. for each emission, asks one question: **is that exact emitted string present, whole, in some post-trim
   payload of this session?** No pairing of records to calls. Only a small set of renderings that carry
   the string unchanged is recognised; anything else (pretty-printed, partially projected, re-encoded)
   leaves the emission counted as not delivered;
5. replays the delivered emissions, **in emission order**, through the accumulator rule of
   `observation-read-grant.ts:663-686` — which is to be **extracted into one pure reducer** that both the
   in-dispatch accounting and this step import. Reconciliation performs no splitting, no part-index
   arithmetic, and no allowance re-derivation of its own;
6. publishes a receipt (schema version bumped, because the meaning of `served` changed) **only** when the
   above succeeded end to end. Otherwise the reconciliation is `unverifiable` and no receipt exists.

The existing consumer, which admits an observation only when its parts are completely covered
(`observationIdsServed`), is unchanged.

**Why not compare digests of whole records:** the post-trim record is a *rendering* produced by
model-authored JavaScript, not a clean copy. If the model deliberately printed only part, the emission
counts as not delivered — held to be semantically correct, since text that never entered the context
cannot support a citation.

**Unverifiable vs empty.** A missing or unreadable transcript does not mean nothing arrived. The design
therefore separates "verified, and here is the delivered set" from "unverifiable"; only the first can
produce a receipt. The consumer's projection is empty in both cases, but the operator record keeps the
cause.

**Fail-closed set** (each ⇒ no receipt ⇒ consumer admits nothing): banner absent or ambiguous; rollout
missing/unreadable; `session_meta` or lifetime-window mismatch; `cli_version` outside the verified list;
transcript structure not as expected; runtime dies before reconciliation.

**Concepts introduced:** `emissions` (the exact strings sent), `DeliveryReconciliation` (sole producer of
the delivered set; result is `verified` or `unverifiable`), `verified_cli_versions`. No challenge, no
acknowledgement, no new tool operation, no change to the tool schema, no additional worker calls.

**Rejected alternative (state your view):** an acknowledgement protocol in which each page carries a
one-use random challenge the worker must return in a later call. Measured as available: 4/4 challenges
returned byte-identical, 0 copy failures. It was set aside because it proves only that *something*
arrived — a trimmed page whose challenge survived would still be certified — and because it consumes
worker call budget, which is already the binding constraint (32-call cap against a corpus needing ~56
pages at a safe page size).

**Staged plan.** (0) extract the accumulator into a pure reducer, behaviour unchanged; (1) transcript
reader, no consumer; (2) pure reconciliation function, checked by replaying real transcripts whose
correct answer is independently known; (3) wire behind the existing opt-in flag, OFF byte-identical;
(4) version and structure gate. The design states that stage 2's falsifiability holds **only within the
topologies whose transcripts exist**, and both existing transcripts are one-call-per-`exec`.

## WHAT TO JUDGE

1. **Soundness.** Can this admit an observation whose body did not enter the model's context? Give the
   concrete sequence if so.
2. **The containment test.** Delivery is decided by whole-string presence of the exact emitted page.
   What breaks that — renderings, encoding, repeated or coincident content, several fetches inside one
   `exec` call, transcripts where the same string appears for another reason?
3. **Dropping record pairing.** The design deliberately abandons matching calls to outputs and asks only
   whether the string appears anywhere among this session's post-trim payloads. What does that cost, and
   is any of it a correctness cost rather than an under-counting cost?
4. **The shared reducer.** Delivered emissions are replayed in emission order through the existing
   allowance-keyed accumulator. Does replaying a *subset* of what was originally served through that rule
   produce a delivered set that differs from what the rule would have produced had only those pages been
   served? Is emission order the right replay order?
5. **Unverifiable as a state.** Is separating `verified` from `unverifiable` worth the extra state, given
   the consumer treats both as empty? Does it create a second authority for the same fact?
6. **Concept economy and the failure class this codebase keeps hitting:** a second mechanism written
   beside an existing one that does not inherit its properties. Does moving the producer of the delivered
   set out of the server, plus extracting the reducer, avoid that — or reintroduce it somewhere new?
7. **Dependence on an undocumented artifact.** Is a verified-version list plus runtime structure
   validation plus fail-closed an adequate answer, or does this dependency disqualify the approach?

## DESIGN PRINCIPLES THIS CODEBASE HOLDS

- **Capability boundary.** Instructions carry semantic work; the capability surface carries structural
  constraints. Make disallowed behaviour unavailable or unaccepted rather than prohibited. Deterministic
  work — parsing, counting, hashing, validating — belongs in code; the runtime may enforce a contract but
  must never reason about or repair a deficient result.
- **Concept economy.** Before adding a concept, find the nearest existing one and choose explicitly:
  reuse, extend, rename, split. Minimise the number of PLACES one rule is declared.
- **Staged, minimal, reversible.** Smallest viable path; behaviour-changing work lands behind a
  default-off path that preserves current behaviour when off.
- **Falsifiable verification.** Criteria must fail when the mechanism is wrong. A green check counts only
  if it traversed the real path.

## OUTPUT FORMAT

Return all four sections, in this order, as plain text.

```
VERDICT
<SOUND | SOUND WITH CONDITIONS | NOT SOUND — one paragraph>

FINDINGS
<each: severity (BLOCKER/MATERIAL/MINOR), what breaks, the concrete sequence that breaks it, and the fix>

ANSWERS TO THE SEVEN QUESTIONS
<numbered, briefly>

WHAT I WOULD MEASURE BEFORE BUILDING
<ordered by what would change the design most>
```
