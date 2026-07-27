# REVIEW TASK — an implementation design that derives delivery from the worker CLI's own transcript

You are reviewing a design before it is built. Judge it; do not rewrite it into your own preference
unless you can say concretely what breaks.

Repository (read-only): `/Users/kangmin/Documents/onto-mcp`, branch `feat/observation-grant-stage2`.
Relevant code: `src/core-runtime/reconstruct/observation-read*.ts`, `src/core-runtime/llm/llm-caller.ts`.

**Independence constraint — binding.** Do NOT open any file in
`development-records/design/20260727-observation-pull-layer-redesign/`. That directory holds prior
drafts, a previous review round, and the author's own conclusions on this exact question; reading them
converts review into agreement. Everything needed is in this packet. Source under `src/` is fine.

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
     both runs.
7. **The dispatch can be bound to its transcript.** codex prints `session id: <uuid>` on stderr (the
   runtime already captures the child's stderr). The filename embeds that uuid, and the first record
   (`session_meta`) carries `session_id`, `cwd`, `cli_version`, `git.commit_hash`, `git.branch`.
8. **The model cannot reach the filesystem** (worker runs with `--disable shell_tool`; codex's JS tool is
   a V8 isolate with no fs). It cannot write or alter the transcript.
9. Trimming appears **non-deterministic**: two harnesses at identical size and limit produced trimmed and
   intact results respectively.

## THE DESIGN UNDER REVIEW

**Shape.** During the dispatch the MCP server records `emissions` — the pages it sent, with a digest each.
This is an input, not a claim, and never reaches the receipt. After the worker exits, the runtime:

1. reads the session id from the child's stderr;
2. locates the rollout file and verifies `session_meta` (`session_id`, `cwd`, `cli_version`);
3. selects `mcp_tool_call_end` records whose `invocation.server` is this dispatch's server;
4. inspects the corresponding `custom_tool_call_output` records and determines, for each emitted page,
   whether that page's body is present **in full** in what entered the model's context;
5. writes the receipt whose `served` list contains only those pages.

The existing consumer, which admits an observation only when its parts are completely covered
(`observation-read-facade.ts`, `observationIdsServed`), is unchanged.

**Why not compare digests of whole records:** the post-trim record is a *rendering* produced by
model-authored JavaScript (`text(r)`), not a clean copy of the page. So delivery is decided by whether
the page body is contained intact in that output. If the model deliberately printed only part, the page
counts as not delivered — held to be semantically correct, since text that never entered the context
cannot support a citation.

**Fail-closed set** (each ⇒ `served` = ∅): no session id on stderr; rollout missing or unreadable;
`session_meta.session_id` mismatch; `cli_version` outside a verified list; expected record types absent;
runtime dies before reconciliation. The consumer already treats a missing receipt as "nothing served".

**Concepts introduced:** `emissions` (what was sent), `DeliveryReconciliation` (sole producer of
`served`), `verified_cli_versions`. No challenge, no acknowledgement, no new tool operation, no change to
the tool schema, no additional worker calls.

**Rejected alternative (state your view):** an acknowledgement protocol in which each page carries a
one-use random challenge the worker must return in a later call. Measured as available: 4/4 challenges
returned byte-identical, 0 copy failures. It was set aside because it proves only that *something*
arrived — a trimmed page whose challenge survived would still be certified — and because it consumes
worker call budget, which is already the binding constraint (32-call cap against a corpus needing ~56
pages at a safe page size).

**Staged plan:** (1) rollout reader, no consumer; (2) pure reconciliation function, verified by replaying
two real transcripts whose correct answer is independently known; (3) wire behind the existing opt-in
flag; (4) version gate.

## WHAT TO JUDGE

1. **Soundness.** Can this admit an observation whose body did not enter the model's context? Give a
   concrete sequence if so.
2. **The containment test.** Deciding delivery by "is the page body present in full in the post-trim
   output" — what breaks it? Consider the model rendering results in unexpected ways, multiple fetches
   inside one `exec` call, encoding/escaping, and pages whose content coincides with other text.
3. **Record pairing.** `mcp_tool_call_end` carries an exec-scoped `call_id`; `custom_tool_call_output`
   carries the exec tool's own `call_id`. They are different id spaces, so the design pairs them by
   order. Is that safe? What sequence breaks it?
4. **Dependence on an undocumented artifact.** Is a verified-version list plus fail-closed an adequate
   answer, or does this dependency disqualify the approach?
5. **The rejected acknowledgement design** — was setting it aside correct on the stated reasoning?
6. **Concept economy and the failure class this codebase keeps hitting:** a second mechanism written
   beside an existing one that does not inherit its properties. Does replacing the producer of `served`
   avoid that, or reintroduce it?
7. **What must be measured before building**, beyond: whether a direct (non-`exec`) MCP call route
   exists; the exact output ceiling; transcript flush timing at worker exit.

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
