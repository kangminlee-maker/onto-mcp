# REVIEW TASK — what happens to this design across runs, restarts, and concurrency?

You are reviewing a design before it is built. Prior rounds asked whether the mechanism is sound within
one clean dispatch and closed the blockers they found. **Do not re-audit the single-run happy path.**
This round has one question:

> What does this design do at the SEAMS — a second dispatch in the same session root, a resumed run, a
> worker killed mid-flight, two runs concurrently, a reused artifact, the opt-in flag flipped on and off,
> the feature shipped but not yet gated?

Repository (read-only): `/Users/kangmin/Documents/onto-mcp`, branch `feat/observation-grant-stage2`.
Relevant code: `src/core-runtime/reconstruct/observation-read*.ts`.

**Independence constraint — binding.** Do NOT open any file under `development-records/`. That tree
holds the drafts and prior review rounds; reading them replaces your judgment with theirs. Everything
needed is in this packet. Source under `src/` is where you should check claims.

## THE SYSTEM

A runtime drives an LLM worker (OpenAI's `codex` CLI, non-interactive) to author a JSON artifact whose
evidence clusters cite **source observation ids**. The excerpts cannot ride in the prompt, so the worker
**fetches** them through an MCP tool the runtime serves from its own process, and afterwards the runtime
must state which observations actually reached the model and refuse citations outside that set.

**Measured (codex-cli 0.145.0):** tool results are trimmed middle-out on the way to the model; the MCP
server cannot see it. codex writes a per-session transcript ("rollout") that contains both the server's
pre-trim result and the post-trim payload that entered the model's context, and prints a `session id`
on stderr that binds a dispatch to its transcript.

**Existing lifecycle facts in the code today** (verify them):
- The receipt path is derived from the session root plus a literal round id, so a resumed run or a
  second dispatch finds its predecessor's file already sitting there. The runtime therefore CLEARS that
  path before a launch, and the file also carries a launch token that the reader must match
  (`observation-read-facade.ts`, `prepareObservationReadFacadeLaunch` and the reader).
- The server refuses to start when a receipt for its own launch already exists — "one launch serves one
  dispatch" — and writes an opening receipt BEFORE serving anything, so that "granted, served nothing"
  is distinguishable from "no facade ran at all".
- The receipt is committed after each response's bytes are on the wire, not before.
- Grants carry a call budget and a cumulative character budget.

## THE DESIGN UNDER REVIEW

**During the dispatch**, the MCP server keeps one launch-bound artifact, written atomically before
anything is served, holding: `served` (transport truth, existing name and meaning); the exact string
each response carried (`JSON.stringify(page)`, verbatim); a launch-bound start marker so a second start
under the same launch fails before minting a grant; and the existing audit fields (attempts rejected
before the grant, bounded failure list). This artifact is NOT readable as a delivery receipt.

**After the worker exits**, the runtime reads the session id from the child's stderr (requiring exactly
one CLI-origin banner, a rollout creation time inside the child's lifetime, matching canonical `cwd` and
`session_meta`), checks `cli_version` against a verified list, validates the transcript's structure,
inspects only post-trim payloads, and for each emitted string asks whether that exact string appears
whole in some post-trim payload of this session. Delivered emissions are replayed in emission order
through the existing allowance-keyed accumulator (extracted to one shared pure reducer) to produce
**`delivered`**. A receipt (new schema version) is published **only** on full success; otherwise the
result is `unverifiable` and no receipt exists. `unverifiable` and "verified, nothing delivered" must
reach the operator as different statements.

**Staged plan.** (0) extract the reducer; (1) transcript reader, no consumer; (2) pure reconciliation
function; (3) wire behind an opt-in flag, OFF byte-identical, and NOT product-reachable until (4);
(4) version and structure gate.

## WHAT TO JUDGE

Ground each answer in the code where the code decides it. Give the sequence, not the principle.

1. **Second dispatch, same session root.** Walk it: predecessor artifacts present, launch token, the
   clear step, the start marker, the transcript from the EARLIER run still on disk. Where can a later
   run read an earlier run's evidence, or refuse because of it?
2. **Resume.** A run that resumes after a failure — which of these artifacts is it entitled to reuse,
   and which must it refuse? What does the design do if a resumed run's reconciliation succeeds while an
   earlier attempt's did not, or vice versa?
3. **Concurrency.** Two dispatches at once, same project, same `cwd`. Consider the stderr banner rule,
   the rollout creation-time window, and the artifact paths. What collides?
4. **Kill points.** Enumerate where a SIGKILL leaves state that a later run misreads: after serving but
   before the artifact write; after the artifact write but before the worker exits; after the worker
   exits but before reconciliation; during receipt publication.
5. **Budgets and the restart hole.** The grant carries a call budget and a character budget. If the MCP
   server is restarted by codex within one dispatch, what stops a fresh grant from re-granting a full
   budget — and does the design's start marker actually close that, or only detect it afterwards?
6. **The opt-in boundary.** Stage 3 lands wired but must not be product-reachable until stage 4. State
   how "OFF is byte-identical" can be PROVEN rather than asserted, and what would make an accidentally
   reachable stage-3 path visible.
7. **Retention.** The transcript is an undocumented artifact under the user's home directory, subject to
   rotation, cleanup, and privacy expectations. What breaks when it is gone, and what should never be
   copied out of it into a repo artifact?

## OUTPUT FORMAT

```
VERDICT
<one paragraph: does the design hold at the seams, and which seam is weakest>

FINDINGS
<each: severity (BLOCKER/MATERIAL/MINOR), the concrete sequence across runs/processes, and the fix>

ANSWERS TO THE SEVEN QUESTIONS
<numbered, briefly>

WHAT I WOULD MEASURE OR ASSERT BEFORE BUILDING
<ordered by what would change the design most>
```
