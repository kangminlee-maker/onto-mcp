# 리뷰어 — gpt-5.6-sol/max, 조용한 오답(silent wrongness) 렌즈 R3 (2026-07-28)

> 블라인드 패킷 [16](16-crossverify-packet-silent-wrongness.md)에 대한 판정. 지정 형식 전문 반환.
> VERDICT = **조용한 오답 경로가 살아남는다**, 발견 **BLOCKER 2 + MATERIAL 3**.
> 반영 상태는 [11 §12](11-implementation-design-delivery-reconciliation.md) 참조.
>
> 이 렌즈는 capacity로 **4회 NOT-RUN 후 5번째에 반환**됐다(max 3·xhigh 1 거절 → max 성공).
> 거절은 전부 추론 전이라 토큰 소모 0이며, 실패 증거는
> `benchmark/reconciliation-review-r3/silent-wrongness/attempt*-capacity-error.stderr.txt`.

## 반환 원문

VERDICT

A silent-wrongness path survives. The filtered reducer and exact-string positive match do not themselves invent delivery, but the accepted JSON may come from a later parse-repair worker while the receipt proves delivery only to the first worker. That path is already accepted by a green test. A second, highly reachable implementation risk is leaving any consumer or resume path on `served`; current canonical validation does not independently consume a delivery receipt. Whole-string containment also produces confidently wrong negative reports because it proves presence, not absence. This review used source only and did not open `development-records/`.

FINDINGS

1. **BLOCKER — Delivery authority crosses into a different authoring attempt during JSON repair.**

   Concrete sequence: the first worker fetches observation `O`, reconciliation correctly proves `O` reached that worker, but its JSON is malformed. `callJsonAuthor` then starts a second LLM dispatch and explicitly removes the facade; that worker receives only the malformed text and parse error, not `O`’s body ([authoring-llm-call.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/authoring-llm-call.ts:307)). The second worker returns valid JSON retaining `O`’s id but changing or inventing the proposed claim. The consumer then reads the first dispatch’s receipt after repair completes and admits the repaired citation ([direct-call-directive-author.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/direct-call-directive-author.ts:3380)).

   The artifacts say: first attempt `malformed_json`; parse-repair `succeeded`; receipt `delivered=[O]`; final ledger cites `O`; ledger validation is `valid`. Nothing records that the accepted semantic scalars came from a worker that never received `O`.

   This is already test-sanctioned: the first fixture response is literally `"{ not json"`, while the second invents a complete evidence cluster citing the fetched ids, and the test expects success ([observation-read-pull.test.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/observation-read-pull.test.ts:377)). The repair prompt asks for punctuation-only edits, but no runtime check enforces that restriction.

   Fix: either use deterministic, scalar-preserving syntax repair and prove every scalar/string/id is unchanged, or rerun full authoring under a fresh grant and bind the final artifact to that final attempt’s receipt. A repair that adds or changes any scalar must not inherit another attempt’s delivery authority.

2. **BLOCKER — The `served → delivered` migration is not structurally closed or durably revalidated.**

   Concrete sequence: a 65k page containing whole observation `O` is emitted; Codex middle-elides `O`’s body. Transport truth says `served=[O]`; reconciliation says `delivered=[]`. If the current `observationIdsServed` helper or its production caller survives the migration, `O` is admitted ([observation-read-facade.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/observation-read-facade.ts:838), [direct-call-directive-author.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/direct-call-directive-author.ts:3391)).

   The raw delivery receipt would disagree, but the canonical ledger validation has no delivery-receipt input or reference ([maturation-validation.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/maturation-validation.ts:2710), [artifact-types.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/artifact-types.ts:2419)). Consequently the ledger and its validation can both say success; no operator projection flags the cross-artifact contradiction.

   CI is particularly liable to miss this: its pull tests equate `session.commit()` with delivery, while credentialed live scripts are excluded from CI ([invariants.yml](/Users/kangmin/Documents/onto-mcp/.github/workflows/invariants.yml:45)). The live probe fetches two deliberately small observations and still treats `served` as its authority ([observation-read-pull-live.mts](/Users/kangmin/Documents/onto-mcp/scripts/observation-read-pull-live.mts:105)). Resume adds another hole unless `AUTHORED_OUTPUT_CONTRACT_VERSION` is bumped from 2; its own contract says acceptance-rule changes require a bump ([authored-artifact-reuse.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/authored-artifact-reuse.ts:42)).

   Fix: split branded transport and delivery types; remove `observationIdsServed` from consumer reach; make canonical validation assert `citation ids ⊆ delivered ids`; persist the receipt ref/hash and authoring attempt; bump the authored-output contract version; reject or regenerate old served-only artifacts.

3. **MATERIAL — Whole-string containment is sufficient evidence of delivery, but absence is not evidence of non-delivery.**

   Concrete sequence: the server emits compact `S = JSON.stringify(page)`. Model-authored JavaScript parses the result and renders only the complete observation body:

   ```js
   const page = JSON.parse(result.content[0].text);
   text(page.entries[0].body);
   ```

   The full source observation reaches the model, but compact envelope `S` is absent. Reconciliation succeeds structurally and publishes `delivered=[]`; the citation is refused.

   The artifact says “verified, nothing delivered.” That is false: what was established is only “the server’s canonical rendering was not found verbatim.” Nobody notices because the transcript reader is behaving exactly as specified and there is no unmatched-rendering classification.

   Fix: either structurally constrain a canonical pass-through rendering, or rename the negative state to `verbatim_delivery_not_attested`. Record per-emission match disposition. Do not report unmatched containment as proof that content was absent.

4. **MATERIAL — Server emission order is not necessarily model-visible rendering order.**

   The current server serializes requests and commits after each successful stdout write, which gives a real server-wire order ([observation-read-facade-server.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/observation-read-facade-server.ts:58)). It does not constrain model-authored JavaScript:

   ```js
   const [a, b] = await Promise.all([read(A), read(B)]);
   text(b.content[0].text);
   text(a.content[0].text);
   ```

   The server may record `A,B`; the model receives `B,A`. Atomic artifact writes do not bridge that difference. The two known transcripts, each with one MCP call per `exec`, cannot expose it.

   Because the reducer resets on `part_allowance`, replay order can select a different partition and falsely refuse a previously complete delivery. It still cannot admit an undelivered part if containment filtering is correct.

   Fix: derive replay order from transcript payload sequence plus match offsets, failing closed on ambiguous matches; or make delivered accumulation order-independent by tracking every `(observation_id, hash, part_allowance)` partition and admitting if any one is complete.

5. **MATERIAL — `unverifiable` versus verified-empty currently has no surviving typed/operator carrier.**

   The current reader maps missing, torn, wrong-version, and wrong-launch receipts to `null`, and the set helper maps `null` to empty ([observation-read-facade.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/observation-read-facade.ts:773)). If the rollout is unreadable after content actually reached the model, no receipt exists and current consumer prose reports “never served.”

   The artifact state is merely: transport audit exists, delivery receipt absent. It does not preserve reconciliation status or failure reason, so the operator cannot distinguish failure to verify from verified non-delivery.

   Fix: persist a separate reconciliation outcome with `verified | unverifiable`, reason, session binding, CLI version, and rollout ref. Consumer admission remains empty in both cases, but operator reporting must consume the typed outcome rather than infer meaning from receipt absence.

ANSWERS TO THE SIX QUESTIONS

1. For `A1(delivered), B1(not delivered), A2(delivered)`, where `A` has two parts, replaying all emissions ends at `A:{2}` because both allowance changes reset state. Replaying the delivered subset gives `A:{1,2}` and admits it. That admission is correct: both parts of one partition reached the model. Filtered replay cannot invent a part; its intrinsic error is conservative refusal, not wrong admission.

2. Parsing and re-rendering the page body makes the emitted compact string absent although the observation arrived completely. The design lands on the false-negative side. Within one correctly bound attempt, finding the whole exact string in an actual post-trim payload is sound positive evidence; it does not prove causal attention.

3. The required readers/migration seats are:

   - `readObservationReadFacadeReceipt` and `observationIdsServed`
   - `writeAnswerSupportLedger` in `direct-call-directive-author.ts`
   - `ObservationReadFacadeSession`’s second-start check, which must move to the launch artifact
   - `scripts/observation-read-pull-live.mts`
   - `observation-read-facade.test.ts` and `observation-read-pull.test.ts`
   - `validateAnswerSupportLedger` and its validation artifact
   - `AUTHORED_OUTPUT_CONTRACT_VERSION` for resumed artifacts

   Grant-registry `served` accounting should remain transport truth.

4. The existing FIFO server guarantees wire order only. Model-authored JavaScript can reorder concurrent results before rendering them. Wrong replay order can change which allowance partition survives and cause a silent false refusal, but cannot admit text absent from every matched payload.

5. The strict silent-success case is parse repair: the first worker receives `O`; the final, receipt-less repair worker authors the accepted JSON; runtime validates that JSON against the first worker’s receipt. Current tests already bless an even stronger version where the repair output invents the entire cited cluster.

6. A worker parses the page and renders the complete body or pretty-printed page. Exact compact containment fails, the receipt says verified-empty, and the operator report blames non-delivery. The real cause is noncanonical rendering.

WHAT WOULD MAKE THE WRONGNESS VISIBLE

- Bind every accepted artifact to `authoring_attempt_id`, Codex `session_id`, delivery receipt ref, and receipt hash. Require the final semantic authoring attempt to own the receipt.
- Add a canonical validation assertion: every cited observation must be complete in that exact receipt. Record the assertion and receipt ref in the validation artifact.
- For parse repair, assert ordered scalar preservation; reverse the current test so `"{ not json" → invented evidence cluster` fails.
- Record `emission_seq`, JSON-RPC id, successful-write order, matched transcript payload sequence, and match offsets. Test reversed `Promise.all` rendering and multiple MCP calls per `exec`.
- Replace the binary delivery claim with `verbatim_attested`, `not_attested`, and `unverifiable(reason)` unless rendering is structurally canonical.
- Add live cases for an intact small page, a known middle-elided page, full-content re-rendering, stale `served` consumption, parse repair, and resume from the old output-contract version.
- Add a reducer property test: every admitted id must have one complete, single-allowance partition whose every contributing emission has a verified model-visible match.
