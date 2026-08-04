# 리뷰어 B — gpt-5.6-sol/max (교차 계열·hermetic·read-only)

> 블라인드 패킷 06에 대한 독립 판정. 원문 그대로.

PREMISE CHECK

The end-to-end integrity question is well-formed. The question “where inside the response should the proof live?” is malformed: there is no universally sound location inside an oversized response.

Three events must be distinguished:

1. **Emitted** — the MCP server completed its write.
2. **Delivered** — the exact body survived Codex’s transformation and entered the model-visible tool result.
3. **Read/understood** — the model actually attended to and used the content.

The runtime currently observes only (1). The required citation constraint needs (2). No mechanical protocol can prove (3).

For any fixed proof bytes inside a response, a deletion can preserve those bytes while removing other body bytes. More markers merely enlarge the preserved set. Therefore an in-band bearer value cannot, by itself, prove complete delivery over an arbitrary deletion channel.

There are only two structurally sound escapes:

- Make every response an atomic frame that cannot enter the trimming path.
- Generate an integrity attestation at a trusted receiver boundary after trimming has occurred.

The current code’s 65,536-character page budget is already too close to the measured 65,553-character failure to be treated as safe ([observation-read-grant.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/observation-read-grant.ts:102)). Its write callback proves emission, not post-Codex delivery. The existing requirement for complete part coverage before admitting an observation is worth preserving; the state feeding it needs to become acknowledged coverage rather than emitted coverage.

PER-DIRECTION VERDICT

### A — Stay below the ceiling

- **Soundness:** Reduced to one checked place, and conditionally unrepresentable. If the runtime refuses to emit any exact serialized result whose verified token upper bound exceeds the declared ceiling minus margin, the known trimming path is unreachable. If this remains a character heuristic or an unverified margin, incorrect acceptance remains open.
- **Durability:** Independent of whether trimming removes the middle, head, or tail because no trimming should occur. It still depends on Codex honoring the declared limit and having no hidden lower or cumulative limit.
- **Honest-worker cost:** Smaller frames cause more calls. Returning one short opaque acknowledgement per frame is cheap and retryable; computing hashes is unnecessary. Very large observations may become uncitable because they cannot fit within the cumulative context or call budget.
- **Concept economy:** Good if it reuses the existing page, cursor, `part_allowance`, snapshot and complete-part machinery. It needs one authoritative transport-frame policy and one acknowledgement state transition.
- **Unmeasured assumptions:** That upward limit configuration works; that results below the declared limit are never transformed; what exact representation Codex counts; and whether cumulative context pressure can independently transform earlier results.

### B — Prove every region

- **Soundness:** Reduced, not unrepresentable. Under the observed contiguous middle removal, appropriately placed markers would probably detect truncation. But a surviving marker proves only that marker survived—not that every byte in its surrounding region survived. Sparse markers leave gaps that can be deleted undetected.
- **Durability:** Poor. A head-only, tail-only, discontinuous, field-aware or differently aligned policy may preserve every marker while removing content.
- **Honest-worker cost:** Multiple opaque values must be copied accurately, increasing context and false rejection. Exact-region reporting is particularly burdensome.
- **Concept economy:** Weak. It introduces regions, marker placement, region coverage, marker collection and validation, with rules likely repeated across serialization, prompting, receipt construction and citation validation.
- **Unmeasured assumptions:** Exact deletion geometry across versions and tokenizations; marker-copy reliability; whether Codex treats `content` and `structuredContent` independently.

If every region is made independently atomic, B has become A with multiple frames.

### C — Derive the proof from the body

- **Soundness:** Theoretically reduced to one strong equality check if a trusted receiver computes a fresh, undisclosed cryptographic digest over exactly the bytes it received. In the present system it is left open because the receiver is an LLM, not a reliable byte-exact hashing component.
- Returning the existing `observation_content_sha256` would prove nothing: that value is itself carried in the result and can survive without the body.
- A semantic question “spread through” the body is weaker still. It may be inferred from partial content and would require runtime semantic judgment, contrary to the capability boundary.
- **Durability:** Excellent in the theoretical trusted-computation form; poor as an LLM instruction.
- **Honest-worker cost:** Extremely high false-rejection risk. An honest LLM that received all content will not reliably SHA-256 tens of thousands of exact characters. Canonicalization differences create additional failures.
- **Concept economy:** A digest rule can be single-sourced, but only after adding a trustworthy receiver-side executor. Without that executor it is a convention disguised as proof.
- **Unmeasured assumptions:** Exact-hash accuracy at realistic sizes, canonical byte representation, absence of digest leakage, and availability of deterministic computation over the actual model-visible bytes.

### D — Make the trim visible to the runtime

- **Soundness:** As stated—worker-reported length or hash—left open. A model can report the expected length, miss a banner, or reproduce a hash exposed elsewhere. Length also permits collisions between different transformations.
- If trusted code computes a hash after Codex’s trimming step, this becomes the stronger receiver-attestation direction below.
- **Durability:** A trusted post-transform hash is durable against any deletion shape. LLM self-report is not.
- **Honest-worker cost:** Counting or hashing exact text is fragile. Replaying the whole body to a verification tool could be sound, but duplicates the body, can itself be truncated, and defeats the purpose.
- **Concept economy:** One comparison is attractive, but only if the observation point is real. Otherwise the design adds a report that carries no trustworthy evidence.
- **Unmeasured assumptions:** Whether Codex exposes the post-trim representation to a hook or side channel; what normalization occurs before the model; and whether later provider-side transformations exist.

### E — Retire the proof

- **Soundness:** Left open if “served” is redefined as “emitted.” That changes the claim rather than satisfying it.
- If only atomically sized observations are citable, this is a conservative form of A, not proof retirement.
- **Durability:** Poor for emission-only semantics; equivalent to A when backed by a certified atomic-size gate.
- **Honest-worker cost:** Lowest protocol cost, but larger observations become unavailable.
- **Concept economy:** Superficially simple, but dangerous if “served” continues to suggest delivery in citation validation or audit records. The semantic weakening would have to propagate everywhere.
- **Unmeasured assumptions:** The certified atomic maximum and the resulting proportion of observations that would become uncitable.

### F — Trusted receiver-side attestation

- **Soundness:** Reduced to one checked place. Trusted code after Codex’s transformation computes a hash of the exact model-visible result and emits an out-of-band attestation bound to the launch, call, snapshot and frame. The runtime compares it with the emitted-frame hash.
- **Durability:** Best of the candidates. It is insensitive to removal shape and ceiling changes.
- **Honest-worker cost:** None.
- **Concept economy:** One transport attestation and one verifier, but it requires integration at a boundary the current MCP server does not control. A Codex fork or supported hook may be necessary.
- **Unmeasured assumptions:** That such a post-trim/pre-model hook exists and observes the final representation; that its side channel cannot be forged by the model; and that no later unobserved transformation occurs.

RECOMMENDATION

With stock Codex, I would build **acknowledged atomic frames**: A strengthened with a two-phase acknowledgement. I would not use B, C or worker-reported D as the integrity mechanism.

Concretely:

1. When the opt-in layer is enabled, declare one authoritative `tool_output_token_limit=T` for that launch. Do not add a convenience default or change the off path.

2. Size the **entire representation Codex counts**, including envelope, escaping, metadata and any duplicated structured/text content—not merely `entry.body`. Refuse an oversized frame before writing it.

3. Reuse the existing deterministic parts and cursors. Permit only one unacknowledged frame at a time.

4. Include an opaque, single-use 256-bit `ack_challenge` in each atomic frame. Bind it server-side to:

   ```
   launch + grant + snapshot_digest + frame_sequence + frame_sha256
   ```

5. The worker returns that challenge in its next read request; the last frame requires a small final acknowledgement call. A typo remains retryable while the challenge is pending.

6. Treat the stdout write callback as **emitted**, not delivered. Only a valid later acknowledgement changes the frame to **acknowledged**.

7. Persist the proof in the runtime-owned receipt, not in the authored artifact. The receipt record should identify the acknowledged frame and its digest; the raw challenge need not be persisted.

8. Derive citable observation ids only from complete acknowledged coverage under one `(snapshot_digest, observation_id, content_sha256, part_allowance)` partition:

   ```
   citable(observation) =
     every canonical part acknowledged
     AND every containing frame passed the atomic-size gate
   ```

The challenge in the response is not itself the proof. The proof is the runtime-side acknowledgement record combined with the enforced atomic-frame invariant.

If atomic delivery below a declared limit cannot be certified, the system must fail closed or obtain receiver-side attestation. There is no honest third option that preserves the original claim.

WHAT YOUR RECOMMENDATION DOES NOT SOLVE

- It proves availability of bytes to the model, not attention, comprehension, relevance or correct causal use.
- It does not make a body larger than the cumulative context/call budget deliverable.
- It does not protect against an unobserved provider-side transformation after the certified boundary.
- It does not remain sound if Codex trims results below the declared frame limit or ignores that configuration.
- It does not prove that a citation accurately supports the authored conclusion.
- When the feature is off, it intentionally provides none of this stronger delivery evidence.

REQUIRES MEASUREMENT

The existing measurements decisively falsify the current delivery assumption, but one run per row does not certify a production-safe operating point. Cap selection should satisfy the repository rule of at least three runs, at least two fixtures, and reported variance.

1. **Ceiling authority:** Run explicit `T` values with results just below, at and above each limit. Verify random probes throughout the result. Include an upward-setting probe.

2. **Counted representation:** Determine whether Codex counts the text content, structured content, their normalized rendering, or another envelope. Vary duplication and JSON escaping independently.

3. **Below-limit atomicity:** Test the chosen margin using ASCII, CJK, code, escape-heavy JSON and high-token-density content. Every probe in every below-bound result must survive.

4. **Cumulative interaction:** Fetch many individually safe frames near the overall context limit and determine whether earlier tool messages are later compacted or transformed independently.

5. **Acknowledgement path:** Exercise exact acknowledgement, typo and retry, replay, cross-launch token use, missing final acknowledgement, process death before receipt persistence, and multiple-part completion through the real Codex path.

6. **Small tool-input integrity:** Confirm that the returned acknowledgement argument reaches the MCP server unchanged and is not subject to the result-trimming mechanism.

7. **Off-path equivalence:** Capture the real dispatched argv and stdin bytes with the feature disabled and require exact equality with the existing path.

8. **Receiver attestation, if pursued:** Establish that the hook runs after truncation and before model submission. Force middle-, head- and tail-loss variants and require the attested hash to differ from the emitted hash in every case.
