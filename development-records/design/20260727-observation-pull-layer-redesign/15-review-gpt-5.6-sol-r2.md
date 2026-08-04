# 리뷰어 — gpt-5.6-sol/max, 개정 재조정 설계 R2 (2026-07-28)

> 블라인드 패킷 [14](14-crossverify-packet-reconciliation-r2.md)에 대한 판정. 지정 형식 전문 반환.
> VERDICT = **SOUND WITH CONDITIONS**, 발견 **MATERIAL 4 + MINOR 1** (R1의 BLOCKER 4는 닫힘).
> 반영 상태는 [11 §10](11-implementation-design-delivery-reconciliation.md) 참조.
>
> ⚠ 같은 라운드에 `gpt-5.6-terra`/high·`gpt-5.6-luna`/high도 디스패치했으나 **owner 판단으로
> 리뷰 좌석이 아니다** — 렌즈로 계상하지 않고 그 산출물은 이 폴더에 두지 않는다
> (원본은 `development-records/benchmark/reconciliation-review-r2/`에 남아 있다).

## 반환 원문

VERDICT
SOUND WITH CONDITIONS — The core mechanism is sound: if every counted emission appears whole in a strictly identified model-visible post-trim payload, and the shared allowance-keyed reducer requires complete coverage, repeated or coincident strings cannot manufacture unseen body content. I would approve it only if the version/topology/record-order gate ships before the opt-in becomes reachable, the emissions artifact inherits the current launch-lifecycle and cumulative-budget protections, and “emitted/served,” “delivered,” and “unverifiable” remain distinct authorities and diagnoses.

FINDINGS
MATERIAL — Stage 3 cannot become product-reachable before Stage 4. The transcript parser’s safety depends on knowing the exact model-visible field and record order. Concrete sequence: Codex changes a rollout shape so a custom-output record contains trimmed model-visible output plus a full diagnostic sibling; an ungated or permissive scanner finds the emission in the sibling and publishes a receipt although those bytes were not model-visible. Similarly, an output recorded after the accepted terminal response must not count. Fix: make each verified CLI version select one exact parser/extractor and accepted topology; assert that counted outputs precede the accepted final response; unknown fields, order, topology, or version produce `unverifiable`. Wiring may land earlier only if it remains unreachable.

MATERIAL — Removing the server receipt also removes the current durable one-launch latch unless that property moves explicitly. Today `observation-read-facade.ts:447-478` refuses a second facade for the same launch. Concrete sequence: the first facade spends 32 calls and exits; Codex restarts the MCP server with the same descriptor and token; because no receipt/launch marker exists, it mints a fresh grant and receives another 32 calls and fresh character budget. This breaks the structural call/context bound even though reconciliation remains citation-safe. Fix: the emissions artifact must begin with an atomically created, launch-bound marker and make a same-launch second start fail before minting. It must also preserve monotonic emission order and cumulative attempt/budget audit.

MATERIAL — Reusing `served` to mean post-trim delivery creates a mixed-authority artifact. The current contract explicitly says `served` means runtime-served, not model-read (`observation-read-grant.ts:372-375`). Concrete sequence: ten pages leave the facade, four survive Codex trimming; a receipt with `calls_served=10`, ten-page `chars_served`, but `served=[]` containing four delivered pages has incompatible meanings in one record. Schema versioning protects old readers, but not new code or operator interpretation. Fix: retain emission/transport facts under their existing meaning and name the reconciled projection `delivered`; make reconciliation the sole source for `observationIdsDelivered`.

MATERIAL — Keeping the consumer unchanged makes the new `unverifiable` state diagnostically false. Concrete sequence: the worker receives page X, its rollout is later unreadable, reconciliation becomes `unverifiable`, no receipt exists, and the current consumer at `direct-call-directive-author.ts:3445-3453` reports that the runtime “never served” X. Admission is safely denied, but the stated cause is wrong. Fix: pass a discriminated reconciliation result to the diagnostic boundary, while continuing to project an empty admissible set; report “delivery could not be verified” separately from “verified and not delivered.”

MINOR — The current receipt also retains bounded source-reader failures, rejected-call counts, and budget state. An emissions-only file that records successful page strings loses this. Concrete sequence: the facade returns `artifact_malformed`, no page emission exists, and the final record says only verified-empty without preserving the actual source failure. Fix: preserve those runtime attempt facts in the launch-bound emission/audit artifact; they must not participate in delivery reconciliation.

ANSWERS TO THE SEVEN QUESTIONS
1. Under the stated premises, no. A completed reducer record implies parts 1…N from one allowance. Every contributing page string occurred whole in model-visible output, and the split is a pure function of body plus allowance, so every body part entered context. A counterexample requires searching a non-visible field, accepting a post-terminal output, mixing launches/snapshots, or reimplementing the reducer incorrectly; those must be gated out.

2. Pretty-printing, reordered keys, double encoding, escaping, partial projection, compression, or splitting one emission across payloads cause false negatives. Multiple fetches in one `exec` are safe only when each emission independently survives as a contiguous substring of the actual payload; this topology is not yet evidenced. Repeated or coincident content does not create a citation-safety error: if the exact page string occurs for another reason, its body bytes still entered context. It does lose occurrence provenance and multiplicity. Search decoded payload values, never raw JSONL envelopes.

3. Dropping pairing loses call attribution, multiplicity, chronology, argument-to-result provenance, and precise trim diagnosis. With strict model-visible and pre-terminal extraction, those are audit costs or under-counting costs, not body-delivery correctness costs. I agree with rejecting challenge acknowledgement as the primary mechanism: a surviving challenge proves only the challenge survived, and JavaScript can copy or compute an acknowledgement from the raw pre-trim result without exposing the page to the model. The 4/4 result does not repair that logical gap.

4. Yes: replaying the filtered emissions in original emission order is exactly the reducer result had only those pages been served in that order. Omitting an emission can correctly remove a later allowance reset—for example, complete allowance A followed by a trimmed incomplete allowance B should leave A complete. Emission order is the correct counterfactual server-response order because the facade serializes responses. Store an explicit monotonic sequence. Reordered rendering inside a multi-call `exec` needs topology evidence, although exact-content soundness does not depend on occurrence pairing.

5. Yes. Verified-empty means the observer worked and found no complete delivered page; unverifiable means the observer failed. They require different operator action, compatibility handling, and retry diagnosis. This is not a second authority if `DeliveryReconciliation` is the single source, the receipt is its projection, and the operator record does not independently publish another delivered set.

6. Moving delivery authority out of the server is correct because only the rollout can observe Codex’s trim. Extracting the reducer removes the most dangerous duplicate rule. The new duplication risks are the version list beside the parser, the emissions writer beside existing launch/budget lifecycle logic, and `served` beside `delivered`. Use one version→parser/topology registry, one reducer, one launch-bound emission/audit artifact, and one derived delivery receipt.

7. The undocumented dependency does not disqualify the approach for safety: verified versions, strict runtime structure/order validation, and fail-closed behavior are sufficient, especially for a default-off feature. It is not sufficient for availability. A CLI update may disable the feature until reverified, and that degradation must be explicit. The compatibility registry should bind an exact CLI version to its parser, accepted topology, and real-transcript evidence rather than maintain a loose version list beside a generic parser.

WHAT I WOULD MEASURE BEFORE BUILDING
1. Multi-call-per-`exec` transcript topology: sequential calls, `Promise.all`, reverse rendering, duplicate calls, rendering only one result, and combined output. For every case compare raw MCP result, decoded post-trim payload, model report, record order, and terminal-response order. Unknown topologies should be deliberately rejected.

2. Facade restart behavior: whether Codex restarts an exited or failed MCP server using the same descriptor, and whether concurrent/restarted servers can reset the 32-call or character budget. Exercise normal exhaustion, EPIPE, server crash, and reconnect.

3. Transcript lifecycle and binding across every intended CLI version: success, malformed model output plus repair, nonzero exit, timeout/SIGTERM, concurrent same-cwd dispatches, date rollover, dirty/non-git cwd, and immediate readability after child exit.

4. Parser/reconciliation mutation tests: the full emission present only in `mcp_tool_call_end`, arguments, an envelope sibling, or after the terminal response; truncated middle; pretty/double encoding; repeated/coincident strings; malformed JSONL; wrong UUID, cwd, version, lifetime, launch token, or snapshot. Every negative must produce no receipt.

5. Reducer property tests over arbitrary page sequences and arbitrary subsets: filtered replay must equal direct reduction of that subset; include allowance changes, equal part counts with different allowances, duplicates, multi-entry pages, and complete-body hash verification.

6. Real product-path runs on at least two materially different corpora, including the 59-observation corpus: successful citation, unfetched citation, partially delivered observation, nondeterministic trim, parse repair, and missing rollout. Also pin OFF-mode stdin, Codex args, prompt, and accepted output behavior byte-for-byte.

For quantitative claims, use at least three runs per condition, at least two fixtures, and report variance. The two current transcripts and the 4/4 acknowledgement probe are preliminary observations, not decision-grade measurements.
