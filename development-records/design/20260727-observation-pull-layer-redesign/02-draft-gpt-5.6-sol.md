ARCHITECTURE

Use a single-authority dispatch evidence broker in the parent `onto` process. The MCP process launched by Codex is a byte relay only: it holds no snapshot, counters, grant state, receipt, or policy.

```text
onto parent process
┌──────────────────────────────────────────────────────────────┐
│ immutable DispatchEvidenceSnapshot                           │
│   catalog + admitted bodies + fixed chunk manifest + digest  │
│                                                              │
│ per-dispatch Evidence Broker                                 │
│   authenticated connection                                   │
│   one meter                                                   │
│   one state reducer                                           │
│   pending delivery challenges                                 │
│   acknowledged-chunk journal                                  │
└───────────────────────▲──────────────────────────────────────┘
                        │ private authenticated IPC
                        │
              Codex-launched MCP relay
              no policy, storage, counters,
              parsing rules, or receipts
                        │ MCP stdio
                        ▼
                  Codex / model

 fetch fixed chunk ──────────────►
 ◄──────── body + delivery challenge
 acknowledge challenge ─────────► committed chunk

 final authored JSON ────────────► onto
                                   │
                                   ▼
                     one evidence-acceptance validator
                     citations ⊆ completely acknowledged ids
                               ⊆ snapshot ids
```

### Off path

The feature gate is above every prompt and worker-configuration transformation:

```text
if feature is off:
    invoke the existing path with the original prompt, args, and env
```

No catalog construction, MCP configuration, evidence metadata, or prompt annotation happens before this branch. Byte-for-byte equivalence of dispatched system and user messages is a required regression property.

### Dispatch preparation

For every enabled LLM dispatch—including a JSON repair dispatch—the parent:

1. Reads the current observations and existing source-safety decisions once.
2. Builds an immutable snapshot containing only admitted observations.
3. Canonicalizes every observation body.
4. Splits each body once using a fixed, measured chunk-size profile.
5. Assigns chunk identities bound to:
   - dispatch snapshot digest,
   - observation ID,
   - observation body digest,
   - fixed byte range.
6. Derives the navigation catalog from that same snapshot.
7. Creates a fresh random `dispatch_id`, authenticated private endpoint, and single-use connection credential.
8. Starts the broker before spawning Codex.
9. Configures the child MCP relay through `command`, `args`, and `env`, including the required `default_tools_approval_mode="approve"`.
10. Names the exchange tool and its fetch/ack protocol in the prompt.

The source file may subsequently be rewritten without changing this dispatch: the broker serves only its in-memory frozen snapshot.

### Fixed-chunk delivery

The model calls one tool, conceptually:

```text
onto_observation_exchange({
  op: "fetch",
  observation_id,
  chunk_index
})
```

The request cannot choose page size, byte allowance, decomposition, or an ID-set cursor. Therefore two reads of the same observation always address the same chunks.

A successful response contains the fixed chunk and an opaque, one-use delivery challenge bound to the dispatch, chunk identity, and exact serialized response hash.

The chunk is initially only `pending`. It becomes `acknowledged` when a subsequent exchange call returns the challenge:

```text
onto_observation_exchange({
  op: "acknowledge",
  delivery_challenge
})
```

Emission, socket write completion, and child-process logging never commit delivery. The acknowledgement is the only committing transition.

This does not prove semantic attention. It establishes that a later worker action depended on a challenge available only in the preceding tool result. The stronger claim that the entire result accompanied that challenge depends on the mandatory lossless-result measurement below.

### Complete-observation accounting

The receipt never stores a mutable `served_observation_ids` field.

It stores acknowledged fixed chunk identities. The only definition of “served observation” is the projection:

```text
served(observation) :=
  expected_chunks(snapshot, observation)
    = acknowledged_chunks(dispatch, observation)
```

A partial observation has zero citation authority. Repeated reads, out-of-order reads, and retries cannot widen this projection because they reference the same fixed chunk identities.

### One exchange gate

The parent broker is the only code allowed to respond to model-facing `tools/call` traffic.

For every call, it charges one shared meter with the exact serialized inbound and outbound frame sizes and a call count. The same gate handles:

- successful fetches,
- acknowledgements,
- duplicate or replayed acknowledgements,
- malformed arguments,
- unknown operations or tool names that reach the server,
- unknown observations or chunks,
- budget refusals,
- internal failures.

Responses are serialized before the meter authorizes them. If the response does not fit, it is not emitted.

The public response encoder accepts only a closed outcome code and fixed public fields. It cannot accept an `Error`, exception message, observation body, or arbitrary lower-layer string. Detailed diagnostics remain parent-local.

The broker state reducer has only these effects:

```text
ReplyAndRemainOpen
ReplyAndClose
CloseWithoutReply
```

Any uncategorized exception becomes `CloseWithoutReply`. Once closed, the endpoint and connection capability are revoked; there is no “terminal error handler” that can continue answering.

### Finalization and validation

After the worker exits, the parent closes the broker and atomically writes a create-exclusive receipt under the fresh `dispatch_id`. A later dispatch cannot overwrite it.

The final artifact is accepted in one place. That validator binds:

- exact authored-artifact digest,
- dispatch ID,
- snapshot digest,
- current evidence contract,
- cited observation IDs,
- completely acknowledged observation IDs.

Acceptance requires:

```text
cited IDs ⊆ completely acknowledged IDs ⊆ snapshot IDs
```

The second inclusion follows structurally because chunk identities can only be constructed from the frozen snapshot.

A JSON parse-repair turn is a new dispatch with a new snapshot instance, broker, meter, and receipt. The repaired artifact is checked only against the dispatch that emitted it. Receipts are never unioned; citations retained from the earlier text must be fetched and acknowledged again.

Resume and cache reuse go through the same validator. Reuse requires the exact artifact digest, matching snapshot digest, a supported receipt, and successful validation under the current rules. A historical certificate alone cannot bypass current validation. A rule change can therefore turn a cache candidate into a miss without relying on a manually synchronized prompt-version constant.

CLASS DISPOSITION

1. **Evidence identity — UNREPRESENTABLE.** A receipt and accepted artifact are bound to one fresh dispatch ID, snapshot digest, and artifact digest; files are create-exclusive, repairs create new episodes, and evidence is never overwritten or unioned.

2. **Produced versus received — ONE CHECKED PLACE.** Only a valid post-response delivery challenge commits a chunk; all write/emission events remain pending. This is conditional on proving a lossless MCP-result bound and does not claim semantic attention.

3. **Completeness — UNREPRESENTABLE.** Decomposition is fixed at snapshot creation, requests cannot alter it, and whole-observation service is derived solely from equality of expected and acknowledged chunk sets.

4. **Metering every outcome — ONE CHECKED PLACE.** One raw-call gate meters both directions and every response it produces. Commitment is blocked unless measurement shows malformed and unknown calls reach that gate rather than generating unmetered Codex-local model-visible errors.

5. **Terminal state — UNREPRESENTABLE.** Closed state owns no response capability; all reducer failures either emit one already-metered final response or close silently.

6. **The error channel — UNREPRESENTABLE.** The model-facing encoder accepts only closed public outcome codes and bounded fixed fields; lower-layer strings and source material are not valid encoder inputs.

7. **Resume and reuse — ONE CHECKED PLACE.** Fresh output, repaired output, and reuse candidates all pass the same current acceptance validator with exact artifact/snapshot/dispatch bindings.

8. **One rule, two declarations — ONE CHECKED PLACE.** Fixed decomposition, metering, state transitions, and served-set derivation each have one executable authority; prompt text, receipts, status output, and cache decisions are projections. A structural drift test must reject a second counter, served flag, decomposition rule, or acceptance path.

CONCEPTS INTRODUCED

`DispatchEvidenceSnapshot` — Owns the immutable, safety-admitted observation set, canonical bodies, fixed chunk manifest, catalog projection, and snapshot digest for exactly one LLM dispatch. Declared in the reconstruct evidence-delivery contract; its executable schema and constructor have one runtime authority.

`DispatchEvidenceReceipt` — Owns the immutable record of one dispatch’s acknowledged fixed chunks and meter termination. It contains no independently authored served-ID list. Declared by one receipt schema consumed by persistence, validation, and read projections.

`ArtifactEvidenceAcceptance` — Owns the single decision binding exact authored bytes to one receipt and verifying the citation subset. Fresh execution, repair, resume, and cache reuse must call it; no parser-local admissibility rule exists beside it.

Fixed chunks and delivery challenges are protocol records inside these concepts, not additional ontology concepts. Existing `SourceObservation`, source-safety admission, LLM dispatch identity, and reconstruct run control should be extended rather than renamed or duplicated.

Implementing these schemas would touch the repository’s protected pipeline-output contract invariant, so implementation must pause for explicit approval before changing that contract.

REQUIRES MEASUREMENT

Every probe must use the exact production Codex command, disabled-shell configuration, model/provider, MCP approval setting, and supported OS. Capability results must be keyed by Codex version and execution profile; an unknown version fails closed.

- **Parent IPC reachability.** Probe whether the Codex-launched relay can connect to a parent-created Unix-domain socket or equivalent private endpoint using only supplied args/env. Test startup, backpressure, abrupt disconnect, Codex restart behavior, and rejection of second connections.

- **Credential isolation.** Put canaries in the relay credential and endpoint configuration; inspect captured provider requests, model-visible tool data, session output, and worker final output. Neither value may become model-visible.

- **Transparent relay behavior.** Send framed results containing Unicode, escaping, embedded newlines, boundary-sized payloads, and randomized sentinels. Compare parent-side and relay-side byte hashes and test partial writes, `EPIPE`, reordered requests, and process death.

- **Lossless MCP-result bound.** Binary-search result sizes with independent payload patterns and markers at several offsets, including a random challenge at the end. Require the next real model call to return the challenge. Use at least three repetitions per size and at least two payload fixtures, recording variance. The fixed chunk cap must stay below the largest repeatedly lossless result—not merely below the largest successful pipe write.

- **Sequential challenge causality.** Verify that a real worker can fetch and then acknowledge a nonce unavailable before the result. Negative controls must cover guessed tokens, replay, wrong chunk, wrong dispatch, acknowledgement before fetch, and fetch followed immediately by final output.

- **Tool-call routing.** Exercise malformed arguments, an unknown operation, an unknown tool name, budget refusal, and server failure. Determine which events reach the broker and which Codex renders locally. If a layer-generated model-visible outcome bypasses the broker, the enabled path cannot claim bounded metering and must remain unavailable for that profile.

- **Tool discovery under the exact prompt.** Verify that the named MCP tool is discovered inside the sandbox and can be invoked repeatedly with the required approval mode, without relying on provider-advertised tool metadata.

- **End-to-end context accounting.** Measure prompt, catalog, tool requests, successful results, acknowledgements, and bounded errors near the provider ceiling. Establish a conservative total byte budget and fixed framing reserve with repeated real runs; local JSON length alone is not sufficient evidence.

- **Finalization ordering and crash behavior.** Kill the relay, Codex, and parent at each fetch/ack/final-output boundary. A crash may lose evidence and force regeneration, but must never produce an accepted artifact whose acknowledged event was not durably available.

- **Receipt filesystem semantics.** Verify create-exclusive naming, atomic finalization, and resume behavior on supported filesystems. A second dispatch must be unable to replace the first dispatch’s receipt.

DOES NOT SOLVE

The architecture proves bounded delivery into the worker’s tool interaction, not that the model understood, considered, or correctly interpreted the text.

It does not establish that:

- the corpus or observations are complete or truthful;
- a cited observation semantically supports the claim;
- existing source-safety classification is correct;
- the model will fetch enough evidence;
- non-Codex workers have equivalent capabilities.

Partial observations remain uncitable, even if the model saw useful fragments. Repair turns must refetch their citations. The protocol adds at least one acknowledgement call per chunk, more latency, a parent IPC service, frozen-snapshot memory, receipts, and version-scoped live capability probes.

If lossless result delivery or complete routing through the broker cannot be demonstrated, the feature must remain off for that worker profile. There is no weaker fallback that still supports the claimed accounting.

WHY NOT THE OBVIOUS ALTERNATIVE

A Codex-launched MCP server that owns the grant and writes its own receipt splits authority between the parent and child. It can persist “served” before meaningful delivery, overwrite evidence across dispatches, develop a second meter or terminal-state table, and must reconcile request-dependent paging. A stream write callback proves only that bytes entered a pipe, not that the worker subsequently received them.

Signed cursors do not fix this. They authenticate cursor origin and can restrict an individual response, but two request-dependent decompositions can still widen the runtime’s inference about a whole observation.

Parsing Codex logs cannot work because the measured logs omit call arguments, results, and observation IDs. Trusting the model’s final message would make the party being constrained its own auditor.

Finally, sending one whole observation per result avoids part accounting only by assuming an unmeasured result-size ceiling. Fixed dispatch-time chunks retain support for large observations without making request shape part of evidentiary truth.
