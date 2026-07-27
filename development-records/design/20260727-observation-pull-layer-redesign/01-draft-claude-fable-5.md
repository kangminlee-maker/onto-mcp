ARCHITECTURE

The design has one trust primitive and three fixed roles, and it moves the load-bearing check from
*timing* (when was a record written relative to delivery?) to *possession* (what can the model only
hold if delivery happened?).

Trust primitive. The model has no filesystem and no process channel (measured constraint 5). Therefore
(a) a file written by runtime-authored code — even code running as codex's child — cannot be forged by
the model, and (b) a random value can reach the model ONLY inside a response the façade actually
emitted. (a) is what the existing implementation uses. (b) is what this design adds, and it is what
dissolves the produced-versus-received problem: instead of proving delivery by carefully ordering a
receipt against a write callback, make the citation itself carry a value that could not exist on the
model's side without delivery.

Roles.

1. RUNTIME (parent of codex; alive and idle during the run — constraint 7, but never contacted live).
   At dispatch it builds an ATTEMPT: an immutable, pre-chunked SNAPSHOT CONTAINER of the admissible
   observations, digested; and a DISPATCH CONTRACT — one file declaring every accounting parameter.
   It mints a random 128-bit dispatch nonce, spawns codex with `-c mcp_servers.onto_observation.*`
   pointing at the façade (`command`, `args=[--contract=<abs path>]`, `env={nonce}`), and waits.
   After codex exits it reads the artifact plus the attempt's journals and runs the ACCEPTANCE GATE.

2. FAÇADE (codex's child, runtime-authored). The only process that can address observation content,
   and it can address only the snapshot container — it is handed the contract path and opens nothing
   else. It has: one EGRESS (a single respond() path through which every frame leaves), one JOURNAL
   (nonce-scoped, append-only, written BEFORE each emission), per-observation coverage state that
   mints a WITNESS TOKEN when coverage completes, and a one-way TERMINAL LATCH whose default is trip.

3. WORKER MODEL. Sees the navigation catalog in the prompt (ids, refs, one-line summaries, and
   parts_total per id), plus — only when the flag is ON — the tool's name, its call shape, and the
   instruction: "a completed read returns a read_token; a citation must carry it." It calls one tool:
   `onto_observation_read({observation_id, part?})`.

Data flow (all paths, exhaustively):

  runtime ──(prompt: catalog + tool naming)──────────────▶ codex ─▶ model
  runtime ──(mcp_servers config: cmd/args/env)───────────▶ codex ─(spawn)─▶ façade
  runtime ──(snapshot container + contract, on disk)─────▶ façade (read-only)
  model ──(tool call frames)─▶ codex ─(stdio)─▶ façade
  façade ──(journal lines, disk, BEFORE emit)────────────▶ attempt dir
  façade ──(response frames: part content | token | catalog error)─▶ codex ─▶ model
  model ──(authored artifact incl. {observation_id, read_token} citations)─▶ codex output ─▶ runtime
  runtime ◀─(journals + artifact, after exit)── attempt dir

  There is deliberately NO live channel façade→runtime, NO channel model→disk, and NO content path
  that bypasses the egress.

The serving protocol. Observations are pre-chunked at snapshot build into parts of a fixed byte size
declared in the contract; part identity is (observation_id, index, byte-range, part-digest) fixed in
the immutable container. The façade serves stored parts; it never decomposes. Every frame — content,
refusal, malformed-args error, terminal notice — passes through the single egress, which (1) measures
the frame's serialized UTF-8 bytes with the one measuring function, (2) debits the byte budget and
call ceiling, (3) appends a journal line and confirms the append succeeded, (4) writes to stdout.
When the coverage bitmap for an observation becomes full, the façade mints one random 128-bit witness
token, journals {mint, observation_id, token, nonce, snapshot_digest}, and includes the token in that
(and any later) response for that observation. Journal-before-emit gives the key one-way property:
nothing the model possesses can be absent from the journal; the journal may over-state delivery by at
most the final in-flight frame, and acceptance never consumes the journal alone.

The acceptance gate (runtime, post-exit, deterministic — no salvage): a citation is valid iff its
(observation_id, read_token) pair matches a mint line in the union of this attempt's journals. The
required invariant falls out as

  cited-with-valid-token ⊆ token-minted ⊆ coverage-complete ⊆ served-parts ⊆ snapshot

where only the leftmost ⊆ is a runtime check; every other ⊆ is structural (the façade cannot mint
without full coverage, cannot serve outside the container it opened, cannot emit unjournaled bytes).

Re-dispatch and resume (constraint 9). Every dispatch gets a fresh nonce and a fresh journal file
under the attempt dir; nothing is ever overwritten. A parse-repair turn is a second dispatch of the
same attempt: it shares the snapshot, and citations carrying dispatch-1 tokens verify against the
attempt-scoped union. A resumed run resolves the attempt by (artifact target, snapshot digest); if the
sources changed, the digest changes, the attempt is new, and stale tokens fail lookup.

Terminal behavior. One latch, one trip() function, default inverted: the enumerated graceful causes
(byte budget below the contract floor, call ceiling reached) trip it, and so does ANY unhandled throw
anywhere in the dispatch loop — the incompleteness of the terminal enumeration is dissolved by making
"continue" the case that needs proof, not "stop". After trip, the egress emits only a terminal frame
pre-serialized at startup (so it cannot fail to construct), still debited and journaled; integrity
trips (journal append failure, snapshot digest mismatch at load) exit the process instead, because a
façade that cannot journal has no safe frame to send. Parameter sanity is checked once, at contract
construction: chunk_bytes ≥ the measured floor, budget ≥ chunk_bytes — a contract that could not
serve one part fails at dispatch, never mid-run.

OFF path. Flag off ⇒ no mcp_servers config, no prompt lines, no artifact schema field, no attempt
scaffolding: dispatched bytes unchanged.

CLASS DISPOSITION

1. Evidence identity — UNREPRESENTABLE. Journals are nonce-scoped append-only files under an attempt
   dir keyed by snapshot digest; nonces are random, never path-derived; every line carries (nonce,
   snapshot_digest). A second dispatch cannot overwrite, and cross-attempt evidence fails token
   lookup because tokens are random per mint.
2. Produced versus received — UNREPRESENTABLE at the acceptance gate. The token travels only inside a
   served response; possession proves delivery, so an accepted citation cannot name content that
   never arrived (forgery is a 2^-128 guess that must also match a journal line). The journal alone
   still over-approximates delivery by ≤1 in-flight frame — declared, and acceptance never reads it
   alone. This replaces delivery-ordering timing code with a possession proof.
3. Completeness — UNREPRESENTABLE for part identity (decomposition happens exactly once, at snapshot
   build; parts are fixed byte ranges in the immutable container; no per-request split exists to be
   incomparable), and ONE CHECKED PLACE for coverage (the per-observation bitmap whose full state is
   the only mint condition).
4. Metering every outcome — ONE CHECKED PLACE: the single egress debits the measured bytes of every
   frame, including refusals, malformed-args errors, and the terminal frame; the tool schema is
   deliberately permissive so malformed calls reach the façade instead of dying unmetered at codex.
   RESIDUAL LEFT: codex's own reply when the model names a nonexistent tool is outside the meter —
   bounded, content-free, declared.
5. Terminal state — ONE CHECKED PLACE: the one-way latch with an inverted default (any unhandled
   condition trips; continuing is the case that needs proof). After trip the only representable
   outputs are the pre-serialized terminal frame or process exit.
6. The error channel — UNREPRESENTABLE. Error frames come from a closed catalog of constants in a
   module that imports nothing snapshot-shaped; the boundary catch (same site as the latch) maps any
   lower-layer error to a code and discards its message; at most the model's own submitted id string,
   length-capped, is echoed. Withheld content is stronger still: it is excluded at snapshot build, so
   no code path in the child can address it at all.
7. Resume and reuse — ONE CHECKED PLACE: the contract carries a rules_digest (self-hash of the
   acceptance-rule module source via import.meta.url; fallback: a hand-bumped scheme version — the
   fallback is the declared weak point), and the authored-artifact reuse key includes the contract
   digest, so a rule change is an input change. Residual: the digest must actually cover the rule
   source; that coverage is the one thing left to review.
8. One rule, two declarations — REDUCED, honestly LEFT as a maintained property: three singletons
   give every rule exactly one home (contract = the only declaration of parameters, façade and gate
   both project from it; egress = the only emission path; journal = the only evidence path; one
   measuring function, all lengths in bytes). Future edits can still add a fourth place; the
   structure makes that visible and expensive rather than impossible.

CONCEPTS INTRODUCED

- Attempt — all evidence for one authored artifact resolves inside one attempt dir, keyed by
  (artifact target, snapshot digest) — declared in the runtime dispatch layer. (Extends the existing
  session-directory concept.)
- Snapshot container — the only content the façade can address; decomposition into parts is fixed
  here, once, at build — declared in the runtime's snapshot builder. (Extends the existing
  source-observation consumption-gate output; withholding = exclusion here.)
- Dispatch contract — the single declaration of every accounting parameter (byte budget, call
  ceiling, chunk bytes, floors, tool name, snapshot digest, nonce, rules_digest); façade config and
  acceptance gate are both projections of this one file, and the reuse key includes its digest —
  declared by the runtime at dispatch. (Extends the existing launch descriptor.)
- Journal — nonce-scoped append-only event log; no frame is emitted that was not journaled first —
  declared at the façade egress.
- Witness token — random 128-bit value minted once per observation at coverage completion; a citation
  is valid iff its token matches a mint line in the attempt's journals — mint declared in façade
  state, verify declared in the acceptance gate, both parameterized by the contract.
- Egress — the single respond() path; every frame is byte-measured, debited, journaled, and is either
  a snapshot projection or a catalog constant — declared in the façade.
- Terminal latch — one-way, default-trip; after trip only the pre-serialized terminal frame or exit —
  declared in the façade shell.

REQUIRES MEASUREMENT

1. Permissive-schema forwarding: does codex deliver arg-malformed calls to a tool whose schema is
   all-optional, rather than rejecting client-side (which would escape the meter)? Probe: live worker
   instructed to call with junk args; the façade journal must show the frame.
2. Per-tool-result truncation in codex — CRITICAL: silent truncation of a part breaks the meaning of
   "coverage" while leaving every check green. Probe: serve a part of exactly chunk_bytes ending in a
   sentinel; the worker must echo the sentinel. chunk_bytes commits only below the measured ceiling.
3. Env opacity from the model side: constraint 5 measures fs, not env — confirm no worker-reachable
   surface (JS isolate, remaining tools) can read the façade's environment or the codex process's.
   Probe: a worker instructed to try; expect failure.
4. Façade spawn environment: cwd and path resolution when codex launches the command. Commit to
   absolute paths everywhere; probe: façade writes its cwd into the journal header at startup (the
   cheap-artifact pattern; a prior wiring assumption here passed 26 in-process tests and died live).
5. Façade lifecycle at codex exit: stdin close arrives and no orphan survives the run. Probe: process
   ancestry check after a live run. (Journal-before-emit removes any flush-at-exit dependency, so
   this is hygiene, not evidence integrity.)
6. Tool-name resolution end to end: the exact string the prompt must name, given server-name
   prefixing and worker config flags (a prior live run measured `--ignore-user-config` deleting the
   server registration outright). Probe: one live round-trip call by that name.
7. Token-copy compliance by the real worker model — the honest-worker usability cost is semantic and
   only measurable live. Probe: N=1 live run; count citations carrying valid tokens versus
   catalog-only citations.

DOES NOT SOLVE

- Reception is not comprehension. A model can fetch every part mechanically and cite; the layer
  proves delivery of bytes, not reading in any cognitive sense. Out of scope by design.
- Codex-composed error strings for nonexistent tool names consume worker context outside the meter
  (bounded, no observation content).
- A worker that genuinely read an observation but mangles the token loses the citation — fail-closed
  by intent, but a real usability cost paid by honest workers; measurement item 7 prices it.
- Prompt overhead: tool naming, part semantics, and the token-copy instruction consume context on
  every dispatch, read or not.
- Chunk-granularity economics: the model pays whole parts for wanting one line; budget pressure can
  starve breadth. chunk_bytes is a contract constant, tunable, never per-request.
- A compromised runtime or façade binary is out of scope: the trust root is that the child runs
  runtime-authored code and the model lacks fs/env channels.
- The artifact schema gains a field under the flag (citation = {observation_id, read_token}); reuse
  invalidation on flag flip is intended and priced via the contract digest.

WHY NOT THE OBVIOUS ALTERNATIVE

1. Live proxy: façade forwards each request over a socket to the runtime, which serves and ledgers
   centrally. Rejected: it splits accounting state across two processes (the exact class-8 shape —
   a counter here, a ledger there), adds an unmeasured live IPC channel inside the child environment
   (the specific thing this codebase has seen punished), and buys nothing — runtime-authored code
   already runs inside the child with full disk trust.
2. Ledger-only accounting (the existing shape): cited ids ⊆ journaled served-set, no tokens.
   Rejected as the primary mechanism because it leaves class 2 representable — a record durable
   before delivery can attest to an emission that never arrived — and repairing that pushes the
   produced/received distinction into delivery-timing code (publish only from the stream write
   callback, reason about drain ordering, exit on EPIPE). That code exists and is careful, which is
   itself the evidence: correctness there is achieved by vigilance. Possession-based evidence makes
   the same property hold without any ordering argument on the emit side.
3. Trust codex's session log as the served-set record. Dead on measured constraint 6: it records
   that a call happened, with no arguments, no result, no ids.
4. Prompt prohibition ("cite only observations you fetched"). A prohibition where the capability
   surface should be: violates the capability boundary, unverifiable, and the whole problem
   statement is that this citation is syntactically perfect and evidentially empty.
5. Inline all content (the status quo ante). Dead on the measurement that created this layer:
   1,328,185 characters against a 1,048,576 ceiling.
