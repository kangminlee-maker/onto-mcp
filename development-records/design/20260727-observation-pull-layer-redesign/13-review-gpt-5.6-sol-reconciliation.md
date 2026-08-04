# 리뷰어 B — gpt-5.6-sol/max, 재조정 설계 (2026-07-28)

> 블라인드 패킷 12에 대한 판정. **전문 반환** — 지정 형식(VERDICT/FINDINGS/ANSWERS/MEASURE)을
> 그대로 따랐고, 발견은 **BLOCKER 4 + MATERIAL 4**다.
> 리뷰어 A(claude-fable-5)는 2회 요청에도 미반환 — NOT-RUN.
>
> ⚠ **정정(2026-07-28 재개 시)**: 이 파일의 최초 헤더와 커밋 `bfd307d`·`7f5831b`는 이 반환을
> "형식 미준수 · 356자 요약만 · 부분 리뷰"로 기록했다. **아티팩트와 불일치한다.** 반영 작업이
> VERDICT 문단만 보고 시작된 뒤 전문이 뒤늦게 파일에 들어왔고, 재독 전에 세션이 끊긴 것으로
> 보인다. 아티팩트를 권위로 삼아 **전문 1벌**로 재계상한다. 반영 상태는 [11 §9](11-implementation-design-delivery-reconciliation.md) 참조.
>
> 원 캡처에는 같은 전문이 codex CLI 푸터(`tokens used`)를 사이에 두고 **두 번** 들어 있었다
> (양쪽 바이트 동일 확인). 캡처 아티팩트이므로 한 벌만 남겼다.

## 반환 원문

VERDICT

NOT SOUND — The rollout is a credible post-trim witness, and the approach is salvageable, but the design as written lacks an exact record relation, a sufficiently defined containment predicate, and a guaranteed reuse of the existing partition-sensitive `served` accumulator. It also must structurally prevent the facade’s current pre-trim v2 receipt from remaining valid before reconciliation. These are correctness blockers; the undocumented rollout dependency itself is not.

FINDINGS

- BLOCKER — Pairing by order is not safe. Sequence: outer exec E1 invokes MCP calls M1 and M2, then produces one `custom_tool_call_output` O1; E2 invokes M3 and produces O2. Ordinal pairing becomes M1→O1, M2→O2, M3→nothing, so fully delivered M2/M3 pages are missed. Concurrency can also reorder the inner completions. With strict full-page matching this is conservative, but it violates the required exact delivered set. Fix: obtain a verified outer-exec parent relation, or match exact emitted pages against the union of isolated post-trim output payloads for that session. If neither is possible, reject non-1:1 topologies rather than shifting by ordinal.

- BLOCKER — “Page body containment” is underspecified. If it means only an observation body or part fragment, coincident source text can attribute one observation’s delivered fragment to another. It must mean the complete canonical emitted page, including snapshot digest, observation id, content hash, part index/count/allowance, body, and cursor. Parse the JSONL envelope, inspect only the actual output payload, and recognize a small verified set of lossless rendering forms. Raw/once-escaped/twice-escaped substring heuristics are unsafe across arbitrary JSON nesting; unexpected transformations should fail closed. Exact coincidence of the complete page is harmless: if that full page representation appears in post-trim output, its information did enter context.

- BLOCKER — The new producer must inherit the existing partition identity rule. The current accumulator deliberately refuses to union parts from different `part_allowance` decompositions ([observation-read-grant.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/observation-read-grant.ts:663)). Concrete sequence: a grouped request delivers part 1/2 ending at character 64,774; a solo refetch delivers part 2/2 starting at 65,068. Unioning indexes by observation id and `part_count` reports `{1,2}` despite a 293-character hole, and the unchanged consumer then admits the citation. Fix: extract and reuse one canonical page-to-served reducer after reconciliation; do not independently recreate it in `DeliveryReconciliation`.

- BLOCKER — No consumer-valid receipt may exist before reconciliation. Today the facade commits a valid receipt after writing bytes to Codex, before Codex performs its hidden trim ([observation-read-facade-server.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/observation-read-facade-server.ts:105)). Sequence: the facade commits a complete page, Codex trims it, rollout reconciliation fails, and the existing v2 receipt remains readable; the current consumer accepts it. Fix: write emissions to a distinct launch-bound journal/schema that the receipt reader cannot accept, then atomically create the receipt only after reconciliation. Because the meaning of `served` changes, bump the receipt version—the existing code explicitly requires a version bump when file meaning changes ([observation-read-facade.ts](/Users/kangmin/Documents/onto-mcp/src/core-runtime/reconstruct/observation-read-facade.ts:284)).

- MATERIAL — Session binding needs a unique, structural stderr parse. `cwd` and CLI version are shared by many sessions. Sequence: an ambiguous stderr stream yields an older UUID; its rollout’s `session_meta` naturally matches that UUID, cwd, and version; a repeated-corpus page then passes containment although it came from the old dispatch. Fix: require exactly one CLI-origin session banner, reject ambiguity, require a rollout creation/start window matching the child, and validate canonical cwd plus the exact session metadata. Never select “first UUID-like string” or “latest matching rollout.”

- MATERIAL — Fail-closed admission is not the same as factual delivery being empty. A page may genuinely arrive while the rollout is deleted or unreadable. Recording `served=[]` as delivery truth would be false even though it is the correct admissible set. Fix: represent reconciliation as `verified` versus `unverifiable`; only the verified state may produce an authoritative receipt. The consumer may still project an empty admissible set, but operator evidence must preserve the cause.

- MATERIAL — A version list is necessary but insufficient. Every accepted rollout must also pass runtime structural validation of record kinds, field types, ordering/topology assumptions, and post-trim payload location. Preflight the version where possible and confirm the actual child’s version from `session_meta`. Unsupported or structurally changed versions should fail before dispatch when possible, otherwise remain explicitly unverifiable.

- MATERIAL — Two replay transcripts do not falsify the dangerous cases. A parser that assumes one MCP call per exec can pass both one-call fixtures. Replays prove deterministic parsing support, not product-path behavior. The codebase’s benchmark invariant also requires at least three runs over at least two fixtures, with variance, before measured behavior becomes decision evidence.

ANSWERS TO THE SEVEN QUESTIONS

1. Yes, unless the blockers above are closed. The concrete over-admission sequences are incompatible part decompositions being unioned, and a pre-reconciliation v2 receipt surviving reconciliation failure. Strict containment of the complete canonical page in the actual post-trim payload cannot itself admit an absent page; it can only undercount.

2. Unexpected renderings mostly cause false negatives: `text(r)`, `text(r.content[0].text)`, `text(r.structuredContent)`, pretty JSON, arrays, multiple `text()` calls, or partial projections all produce different nesting. Use renderer-aware lossless decoding and complete-page identity. Body-fragment matching is insufficient; arbitrary transformations such as base64 may safely remain unrecognized.

3. No. The E1={M1,M2}→O1, E2={M3}→O2 sequence breaks ordinal pairing immediately. Group by a proven parent relation, use session-wide exact page membership, or fail closed on unsupported topology.

4. The undocumented artifact does not disqualify the approach because it is Codex-specific, opt-in, and can fail closed. A version allowlist alone is not adequate; it needs per-run schema conformance, exact session binding, provenance, and explicit unsupported-version behavior.

5. Setting acknowledgement aside as the primary proof was correct. A challenge at a surviving edge proves only the challenge survived; middle-out trimming may still remove the body. The call-budget argument is secondary because acknowledgements could sometimes be piggybacked, but that does not repair the proof. The 4/4 result demonstrates copy reliability, not whole-page delivery.

6. Replacing the sole producer of `served` is the right concept-economy direction only if the old valid producer is removed. `emissions` is a justified internal split because pre-trim emission and post-trim delivery have different truth and failure lifecycles. `DeliveryReconciliation` should remain a deterministic operation, not a parallel artifact authority. The allowance-sensitive accumulator and receipt validator must remain single-sourced.

7. The highest-value additional measurements are listed below.

WHAT I WOULD MEASURE BEFORE BUILDING

1. Transcript topology for zero, one, multiple sequential, and multiple concurrent MCP calls inside one exec; multiple `text()` calls; and overlapping outer exec calls.

2. Exact post-trim rendering for `text(r)`, content text, structured content, arrays, pretty JSON, split outputs, Unicode/control characters, and repeated text; also whether trimming applies per item or to the aggregate exec output.

3. Session binding under concurrent Codex children, duplicate/noisy stderr banners, `CODEX_HOME` overrides, symlinked cwd, date rollover, and `--ephemeral`.

4. Post-trim-record equivalence with independently known probes across at least three runs and two materially different fixtures, including both trimmed and intact outcomes.

5. Reconciliation-to-`served` behavior for refetches, duplicate pages, changed request id sets, different `part_allowance` values, out-of-order pages, and every missing-part position.

6. Crash and failure windows: nonzero Codex exit, timeout/SIGKILL, MCP EPIPE, truncated JSONL tail, deleted rollout, reconciliation exception, and runtime death before/during atomic receipt publication.

7. Same-version transcript variation across feature/config combinations, plus deliberate schema mutations proving the structural gate rejects each dependency it claims to enforce.

8. Rollout permissions, retention/rotation, privacy implications, bounded lookup scope, and worst-case reconciliation time/memory for 32 large calls.

9. An exact off-path snapshot of stdin, argv, environment/config arguments, child count, and generated files, proving the default-off path remains unchanged.

10. A real end-to-end `AnswerSupportLedger` run on at least two corpora, demonstrating that delivered citations pass and trimmed/unread citations fail through the actual Codex/provider path.
tokens used
220,385
