# DESIGN TASK — an on-demand source-excerpt layer whose accounting is structurally sound

You are designing, not reviewing. Produce an architecture. An implementation of this layer already
exists in the repository and you may read it, but it is **evidence about what is hard, not a starting
point** — you are explicitly invited to reach a different shape.

Repository (read-only): `/Users/kangmin/Documents/onto-mcp`, branch `feat/observation-grant-stage2`.
The existing implementation is `src/core-runtime/reconstruct/observation-read*.ts` plus its wiring in
`llm/llm-caller.ts`, `reconstruct/direct-call-directive-author.ts` and `reconstruct/run.ts`.

## THE PROBLEM

A runtime (`onto`) drives an LLM worker to author a JSON artifact whose evidence clusters cite *source
observation ids* — ids of excerpts the runtime previously collected from a real corpus.

The prompt used to carry every observation's full text. Measured: citing all 59 observations of one real
corpus produces 1,328,185 characters against a provider ceiling of 1,048,576. So the prompt now carries
a **navigation catalog** — ids, source refs, one-line summaries, no content — and the worker must
**fetch** the detail it wants.

That creates the problem this layer exists to solve:

> A worker looking at a catalog of ids can cite any of them without ever reading one. The citation is
> syntactically perfect and evidentially empty.

So the runtime must be able to state, after the worker exits, **exactly which observations it served**,
and reject any citation outside that set:

    cited observation ids  ⊆  ids the runtime actually served  ⊆  a snapshot fixed at dispatch time

The layer is opt-in and OFF by default; with it off, the dispatched bytes must be unchanged.

## MEASURED CONSTRAINTS — these are facts, not assumptions

1. The worker is OpenAI's `codex` CLI, run non-interactively. **codex spawns MCP servers itself**: a
   server is a command codex launches. The only channels the runtime has into that child are
   `command`, `args` and `env` (settable via `-c mcp_servers.<name>.*`).
2. `argv` cannot carry a megabyte-scale prompt.
3. **codex does not advertise MCP tools to the model.** The request payload carries only
   `exec`/`wait`/`request_user_input`; MCP tools are discovered inside that sandbox. So the prompt text
   must name the tool if the model is to call it.
4. `mcp_servers.<name>.default_tools_approval_mode="approve"` is REQUIRED, or the worker's call dies as
   `user cancelled MCP tool call`. Neither `auto` nor a global approval policy substitutes.
5. **The model cannot reach the filesystem**: the worker runs with `--disable shell_tool`, and codex's
   JS tool is a V8 isolate with no fs. This is what makes a file written by the runtime's own child
   trustworthy against the model.
6. **codex's session log records only that a call happened** — measured today from a captured live run:
   `mcp: onto_observation/onto_observation_read started` / `(completed)`. No arguments, no result, no
   ids. Anything else in codex's captured output is the MODEL's own final message.
7. The runtime process is alive and idle for the whole worker run (it spawned codex and awaits it).
8. Observations are immutable within a dispatch but the artifact on disk is rewritten during a run, so
   a snapshot must be fixed and digested at dispatch time.
9. A dispatch may legitimately happen more than once for one authored artifact (a JSON parse-repair
   turn), and a run may be resumed into the same session directory.

## EVIDENCE: THE FAILURE CLASSES THIS LAYER PRODUCES

The existing implementation has been through six rounds of adversarial cross-family review — 33
material findings, all closed, each with a negative control. The findings are the most valuable input
you have, because they say where this problem is genuinely hard rather than where one implementation
was sloppy. Abstracted, they fall into eight classes:

1. **Evidence identity.** Which dispatch does a given piece of evidence belong to? Evidence that
   outlives its dispatch, or that a second dispatch overwrites, produces both false acceptance and
   false rejection.
2. **Produced versus received.** Recording that the runtime *emitted* an excerpt is not the same as the
   worker *receiving* it. A record durable before delivery can attest to something that never arrived.
3. **Completeness.** A large excerpt is delivered in parts. Recording that "an excerpt was served" when
   only a fragment arrived lets a citation name content nobody read. Worse: the *decomposition* into
   parts turned out to depend on the request, so part numbers from two different calls are not
   comparable — and two different decompositions can even produce the same part count.
4. **Metering every outcome.** Malformed calls, calls naming an unknown tool, and refusals all consume
   the worker's context exactly like successful ones. Any outcome that escapes the shared limit is an
   unbounded channel.
5. **Terminal state.** Once a session can no longer serve, continuing to answer is an unbounded
   response surface. Which conditions are terminal is easy to enumerate incompletely.
6. **The error channel.** Failure messages cross back to the model. Messages composed by lower layers
   quoted artifact text — including text from excerpts a consumption gate had deliberately withheld.
7. **Resume and reuse.** Authored artifacts are cached and reused when inputs match. A rule that lives
   in the *parser* rather than the *prompt* changes what is admissible without changing any input, so a
   resumed run can reuse an artifact the current rules would reject.
8. **One rule, two declarations.** Nearly every self-inflicted defect took the form of a second
   mechanism written beside an existing one that did not inherit its properties — a second counter
   beside a counter, a length rule declared in two different units, a boundary placed outside the
   condition that gates it.

Notably, four of the last nine findings were failures to read a contract that was *written down* in the
component being used: the reader states its part split is stable only "for a given request"; it states
a client-built cursor "can only ever NARROW what the client receives" (true, yet two narrowed reads
widened the runtime's inference); Node's stream write callback takes an error argument.

## WHAT TO PRODUCE

An architecture for this layer, chosen so that **as many of those eight classes as possible are
structurally impossible rather than checked**. Specifically:

- The shape: which process holds which responsibility, what crosses which boundary, and in what form.
- For each of the eight classes: does your design make it unrepresentable, reduce it to one checked
  place, or leave it? Say plainly which. A design that leaves a class is acceptable if it says so.
- The concepts your design introduces, named, with the rule each one owns. Fewer is better, but a real
  rule expressed once beats a rule enforced by convention.
- What your design does NOT solve, and what it costs.
- **Every capability your design depends on that is not in the measured-constraints list above must be
  named as requiring measurement before commitment.** In this codebase a wiring assumption that passed
  26 in-process tests died on the first real worker run; assumptions about the child's environment are
  the specific thing that gets punished.

## DESIGN PRINCIPLES THIS CODEBASE HOLDS (you do not load them; they are given here)

- **Capability boundary.** Use instructions for semantic work and the capability surface for structural
  constraints. When a behavior must not happen, make it unavailable, invalid or unaccepted rather than
  prohibited. Deterministic work — parsing, counting, serializing, validating — belongs in code, and
  the runtime may enforce a contract but must never reason about or salvage a deficient result.
- **Concept economy.** Keep the concept graph compact. Before adding a concept, find the nearest
  existing one and choose explicitly: reuse, extend, rename or split. Minimize the number of PLACES a
  single rule is declared — not the number of rules enforced. Derived values stay projections of their
  source.
- **Staged, minimal, reversible.** Build the smallest viable path that satisfies the completion
  criteria; minimum limits surface and configuration but never reduces required behavior, runtime
  authority or verification depth. Behavior-changing work lands behind a default-off path that
  preserves current behavior when off.
- **Verification.** Completion criteria must be falsifiable — signals that fail when the mechanism is
  wrong. A green check counts only if it traversed the real path.

## OUTPUT FORMAT

```
ARCHITECTURE
<the shape, in prose and a diagram if useful — what runs where, what crosses which boundary>

CLASS DISPOSITION
<one line per class 1-8: UNREPRESENTABLE | ONE CHECKED PLACE | LEFT OPEN, and why>

CONCEPTS INTRODUCED
<name — the one rule it owns — where it is declared>

REQUIRES MEASUREMENT
<each capability your design assumes about the worker/child environment, and the probe that settles it>

DOES NOT SOLVE
<plainly>

WHY NOT THE OBVIOUS ALTERNATIVE
<name at least one architecture you rejected and the specific reason>
```
