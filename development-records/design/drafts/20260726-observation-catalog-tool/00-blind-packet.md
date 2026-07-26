# DESIGN PACKET — observation-catalog fetch tool for a provenance-bound ontology pipeline

You are producing an INDEPENDENT design draft. Another designer is drafting from this same packet
in isolation; the drafts will be compared. Do not hedge toward a "safe" middle — commit to choices
and state why. If you think a constraint below is wrong, say so explicitly and design anyway.

## 1. The system

`onto` is an ontology-as-code runtime. Its `reconstruct` path derives a bounded ontology "seed"
from real source material (source code, spreadsheets, documents).

Rough pipeline shape:

1. **Inventory + observation capture (deterministic, runtime-owned).** The runtime scans the target
   material and mints *observations*. Every observation gets an `observation_id`, a `source_ref`, a
   content hash, and a `location`. The LLM has no say in this step.
2. **Selection (model-driven).** An LLM picks which observations matter for the stated intent.
3. **Exploration / maturation rounds (model-driven).** The LLM emits `requested_source_refs` asking
   for more material. The runtime validates each request against the inventory, and if accepted,
   mints new observations for it (again deterministically).
4. **Authoring (model-driven, gated).** The LLM authors the ontology seed, competency questions,
   an answer-support ledger, etc. Every claim must cite `evidence_observation_ids`. If a cited id
   does not resolve to a real observation, the runtime REJECTS the output.

The LLM is reached through a CLI worker (`codex exec`, prompt delivered on stdin, answer on stdout).

## 2. The problem — measured, not assumed

**2.1 Prompt payloads scale with input count, and only 2 of ~15 surfaces are bounded.**

An AST scan of the orchestrator found 23 call sites into the authoring interface; **16 of them pass
arguments that scale with the number of observations**. Only two of those surfaces have a size guard
or a detail-reduction "fold".

A benchmark over a real 59-file corpus (the `openai-node` SDK source) demonstrated the consequence:

| | run A | run B (after 2 surfaces were bounded) |
|---|---:|---:|
| LLM dispatches before failure | 2 | **74** |
| failure | provider rejected the prompt | provider rejected the prompt |
| reported size | `1,349,907` vs limit `1,048,576` | `1,361,154` vs limit `1,048,576` |
| failing surface | the first bounded surface | a THIRD, unbounded surface |

Bounding surfaces one at a time moves the failure; it does not remove it. 13 unbounded
count-scaling surfaces remain.

A total-size backstop has since been added at the single dispatch chokepoint, so an oversized
prompt now fails loud with its actual size instead of an opaque worker exit. **It does not reduce
size.**

**2.2 The payload is dominated by one field.**

Measured on the real session's persisted observation artifact:

```
59 observations, 2,634 KB total (JSON)
  structural_data                2,611 KB   (99%)
  source_ref                         7 KB
  location                           7 KB
  summary                            2 KB
  observation_id + source_ref + summary combined:  13 KB  (0.5%)
```

`structural_data` is the per-observation structural inventory (parsed symbol spans, imports,
signatures, doc lines). It is what an LLM needs to reason about *content*. It is not what an LLM
needs to *choose which observations to look at*.

**2.3 An existing mechanism reduces detail but discards it.**

There is already an opt-in "breadth fold": an ordered detail ladder
(`full → inventory_skeleton → one_line → summary_anchor → anchor`) that projects ALL observations at
progressively lower detail so no observation is ever dropped from the catalog. `one_line` is
approximately the 13 KB layer above.

The fold is lossy: detail demoted away is not recoverable by the model within that call.

## 3. Hard constraints

**C1 — Provenance must not break.** This is the product's core value and is enforced at runtime.
Any design that lets the model cite material that is not a captured observation will have its
output rejected by existing gates. Non-negotiable.

**C2 — The tool must not mint or mutate observations.** Capture stays runtime-owned (step 1/3).

**C3 — The tool must not become a general filesystem reader.** Session-artifact scope only.

**C4 — Seat and transport are fixed.** The worker is a `codex exec` CLI process on an
OAuth/subscription seat, sandboxed read-only. Empirically verified: the worker CAN reach MCP tools
(it called one and returned real data) and CAN still reach them under the read-only sandbox, while
file writes are refused. No billing or transport change is available or wanted.

**C5 — Risk already present.** The worker currently sees the operator's whole MCP server list,
including a tool that would start a *new* reconstruct run (recursion hazard). Whatever you design
must say how the worker's tool surface is bounded.

## 4. Decisions already made by the product owner (treat as given)

- **D1** — This is a NEW tool, not an extension of the existing session-status read tool.
- **D2** — The audit record must include the observation ids the model actually FETCHED (not merely
  the ones it ended up citing). Recording every search/browse query was considered and rejected as
  too costly.
- **D3** — The first surface to adopt it is the answer-support ledger authoring call — the surface
  that actually overflowed in the benchmark. It has no fold today.

## 5. What your design must answer

1. **Tool contract.** Name, inputs, outputs, error behavior. What bounds its response size, and what
   happens when a request exceeds that bound?
2. **Session addressing.** How does a worker process, spawned per LLM call, identify *which*
   in-flight session's observations it may read — safely, given C3?
3. **What still gets pushed.** The model cannot fetch what it does not know exists. Define the layer
   that must remain in the prompt, and what happens when even that layer grows too large.
4. **Prompt contract.** How is the model made to actually use the tool? What happens if it ignores it?
5. **Audit record (D2).** Where do fetched ids get recorded, and what — if anything — folds them into
   the reuse/fingerprint keys that today make a run reproducible?
6. **Determinism.** Today the prompt is a deterministic projection of inputs, which is what lets
   reuse keys be sound. Under fetch-on-demand, what a run reads varies. State precisely what
   reproducibility property survives, what does not, and whether that is acceptable — argue it.
7. **Bounding the worker's tool surface (C5).**
8. **Failure modes you expect**, and how each is detected rather than silently absorbed.
9. **Staged implementation plan** with a verification step per stage, and an explicit statement of
   what would falsify the design.

## 6. Alternatives on the table (no ordering implied)

- (a) Extend the existing detail fold to more surfaces, one at a time.
- (b) Impose a generic bound on every count-scaling projection at a shared layer.
- (c) Fetch-on-demand via a tool (the direction D1–D3 assume).
- (d) Reduce the corpus size and accept a smaller measurable claim.

D1–D3 mean (c) is being pursued. You may still argue that some part of the problem is better served
by another option, and where the boundary between them should sit.

## 7. Design principles this codebase holds (apply them; do not restate them)

- **Concept economy.** Prefer reusing an existing concept over adding a near-duplicate. Before
  adding a name (tool, field, enum value, failure kind, config key), find the nearest existing
  concept and choose explicitly: reuse, extend, rename, or split. Splitting is justified when
  runtime behavior, ownership, lifecycle, validation, failure mode, authority, or persistence
  genuinely differ.
- **LLM / capability boundary.** Use instructions for semantic work; use the capability surface for
  structural constraints. When a behavior must not happen, make it *unavailable or unaccepted*
  rather than merely prohibited in a prompt. Deterministic values belong to tools/code, not to LLM
  authority. Runtime may enforce a contract but must not reason about, patch, or salvage a
  contract-failing LLM output.
- **Minimum viable functional path.** Smallest surface that delivers the real behavior on the real
  runtime path. Minimum limits surface area and optional scope; it must not reduce required
  behavior, evidence quality, or verification depth.
- **Reversibility.** Behavior-changing work lands behind a default-off path that is provably
  byte-identical when off.
- **Falsifiable verification.** A green check must be capable of failing. Prefer negative controls.
  Assert the subject set is non-empty before any "no bad X" claim.
- **Root-cause over instance.** If each fix only exposes another instance of the same defect,
  single-source the value and fix the class.

## 8. Output contract

Produce a design document in Markdown. Be concrete and decisive. Required sections:

1. `## Direction` — the design in 5 sentences or fewer.
2. `## Tool contract`
3. `## What stays pushed`
4. `## Provenance & determinism` — answer §5.6 head-on, including what is lost.
5. `## Worker tool surface`
6. `## Failure modes & detection`
7. `## Staged plan`
8. `## Disagreements` — anything in this packet you think is wrong, mis-scoped, or missing, and
   what you would measure to settle it. If a listed constraint or owner decision is a mistake, say
   so plainly here.
9. `## Open questions` — what you could not settle from this packet, and the cheapest way to settle it.

Do not include a preamble, a summary of this packet, or closing pleasantries. Start at `## Direction`.
