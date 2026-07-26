## Direction

Push a complete, **detail-free catalog** of every observation and let the worker pull detail back through one narrow MCP tool, `onto_observation_read`, served by an `onto` process that codex spawns with the session and the budget already baked into its environment — so the tool takes **no path and no session identifier as input at all** and C3 is unenforceable-by-construction rather than validated. The fetch budget is not a new constant: it is the *unspent remainder* of the same `CODEX_PROMPT_INPUT_CHAR_LIMIT = 1_048_576` the always-on backstop already enforces (`src/core-runtime/llm/llm-caller.ts:893`), so pushed + fetched draw on one ceiling and the aggregate cannot overflow by construction. Because pushed detail is now pinned at the `one_line` rung instead of fold-selected, the pushed prompt gets **more** deterministic than it is today, and the 64-observation cap that silently drops supplemental observations (`ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT`, `src/core-runtime/reconstruct/authoring-prompt-payloads.ts:1847`) is lifted — full breadth, not just smaller bytes. The model cannot quietly decline to use the tool: every evidence cluster must cite at least one observation the runtime's receipt proves was fetched, and "the tool never started" and "the model never called it" are two distinct, named failure classes.

## Tool contract

**Name** `onto_observation_read` — third member of the existing read family (`onto_review_read`, `onto_reconstruct_read`), reusing that concept rather than minting a browse/search/fetch vocabulary. Per **D1** it is a separate tool, and it must be: its audience is the worker, not the operator, so it lives on a different tool profile with different dispatch authority.

**Input schema (complete):**

```
{ observation_ids: string[]  // 1..8, deduped by the runtime
}
```

That is the whole schema. No `sessionRoot`, no `projectRoot`, no path, no glob, no query. The session is **ambient in the server instance** (see below), so there is no argument through which a traversal or cross-session read could be expressed. C3 is satisfied by absence, not by validation — the strongest available form.

**Output** — for each id, exactly `observationPromptPayload(sourceObservations, { observationIds: [id], contentExcerptCharLimit: POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT })`: the same deterministic projector the surfaces already use (`src/core-runtime/reconstruct/authoring-prompt-payloads.ts:2117`), at the `full` rung. No new projection concept, and — decisively — **the response is a subset of what this same surface pushes today**, so the tool opens no disclosure surface that does not already exist. Plus a runtime-owned receipt block: `{ fetched_observation_ids, chars_returned, budget_remaining_chars }`.

**Bounds — count is the contract, chars are the guarantee.**

| bound | value | why |
|---|---|---|
| ids per call | 8 | deterministic and pre-announceable in the prompt; the model can plan against it |
| chars per observation | existing `CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET = 40_000` | reuse; makes per-call ≤ ~320 K by construction |
| chars per dispatch (cumulative) | `CODEX_PROMPT_INPUT_CHAR_LIMIT − actual pushed prompt chars − 8 KiB margin` | single-sourced from the provider ceiling; push and fetch share one budget |

**Error behavior** — deterministic, all-or-nothing, never partial:

- `too_many_ids` — >8. Names the cap.
- `unknown_observation_id` — any id absent from the artifact fails the **whole** call, naming which. A partial response would let the model proceed on a false premise; a hallucinated id must be visible to it.
- `budget_exhausted` — the per-dispatch remainder is spent. Returns remaining = 0 and nothing else. The model still holds the full catalog and must author from what it inspected.
- `receipt_unwritable` — the server could not create its receipt at startup; it then refuses **every** call rather than serving unaudited reads. D2 is enforced by the serving path, not by a promise.

All are MCP `isError: true` with a machine-readable `reason_code` in `structuredContent`. The runtime does not reason about, patch, or retry a failed fetch on the model's behalf.

**Session addressing (§5.2).** At dispatch time the runtime spawns codex with the worker server injected by config override — verified honored on the installed codex-cli 0.145.0:

```
-c mcp_servers.onto_worker.command="<abs path to onto>"
-c mcp_servers.onto_worker.args=["mcp"]
-c mcp_servers.onto_worker.env.ONTO_MCP_PROFILE="worker"
-c mcp_servers.onto_worker.env.ONTO_WORKER_SESSION_ROOT="<canonical session root>"
-c mcp_servers.onto_worker.env.ONTO_WORKER_FETCH_RECEIPT="<session>/observation-fetch-receipt.jsonl"
-c mcp_servers.onto_worker.env.ONTO_WORKER_FETCH_BUDGET_CHARS="<remainder>"
-c mcp_servers.onto_worker.env.ONTO_WORKER_DISPATCH_NONCE="<uuid>"
-c mcp_servers.onto_worker.enabled_tools=["onto_observation_read"]
```

The server resolves `ONTO_WORKER_SESSION_ROOT` once at startup through the **existing** boundary code — `assertPathInsideRoot` / `isPathInsideRootRealpathAwareSync` (`src/core-runtime/path-boundary.ts`) plus the session-ownership check `record.session_id === basename(sessionRoot)` already used by `onto_reconstruct_read` (`src/mcp/server.ts:1564`) — loads `source-observations.yaml` into memory, and serves from memory for the life of the dispatch. It never reads the source filesystem: it reads one persisted artifact, which the capture stage already produced and redacted. **C2** holds because the server has no write path to any artifact; its only write is an append to the receipt.

The receipt path carries `ONTO_WORKER_DISPATCH_NONCE` in each line, and the runtime rejects a receipt whose nonce does not match the dispatch it just made — a stale server from a previous call cannot silently supply the audit.

## What stays pushed

**The `one_line` rung, for every observation, always — pinned, not fold-selected.**

`{observation_id, target_material_kind, source_ref, location (where not redundant with source_ref), summary}` — measured at 13 KB / 59 observations, 0.5 % of the artifact. Concretely this is `observationPromptPayload(..., { includeStructuralData: false })`, i.e. rung 3 of the existing ladder in `source-breadth-fold.ts`. Pinning rather than fold-selecting is deliberate and is where I depart from the existing mechanism: the fold picks the *finest rung that fits*, which would spend on pushed detail exactly the budget fetch needs, and makes the pushed prompt a function of corpus size. Pinning restores "same inputs → same pushed prompt."

Two things ride with it, both runtime-owned text:

1. `source_observation_prompt_policy.projection_kind: "catalog_plus_fetch"` with the per-call cap, the remaining char budget, and the fact that **every listed id is fetchable**. The model needs the caps to plan; they are deterministic values, so the runtime states them.
2. The **cap lift**: under fetch mode `promptObservationIds` is the whole capped-region catalog, not `.slice(0, 64)`. This removes both current defects at that surface — the silent drop of supplemental observations past slot 64, and the hard crash in `assertAnswerSupportPromptCatalogHasNoPrioritizedOverflow` when >64 observations are closure-prioritized. The set that gates citations (`promptObservationIdSet`, which today *throws* on an out-of-catalog id at `direct-call-directive-author.ts:3243`) is renamed and widened to the **offered** set = all N. Without this rename the feature would be silently self-defeating: every fetched-then-cited id would crash the parse.

**When even `one_line` grows too large.** The ladder already tails: `summary_anchor` → `anchor` (157 B/row) → `over_budget` → the always-on guard fails loud. Measured reach for the anchor rung is ~6,600 observations on a whole-file corpus. Past that the honest answer is that the *catalog itself* must be fetched — a directory-rolled index page with `onto_observation_read` gaining a `page` input. I am deliberately **not** building that now; the trigger condition is a corpus above ~5,000 observations, and the multi-repo axis is where it will first bind. Stating the ceiling beats pretending there is none.

## Prompt contract (§5.4)

Instructions carry the semantic part — *what* to inspect before asserting support — and nothing structural. Structure is enforced two ways:

- **Caps are announced, not negotiated.** The runtime states max-ids and remaining budget as data. There is no prompt sentence the model can violate to get more.
- **Ignoring the tool cannot produce an accepted output.** A new blocking check, `assertEveryEvidenceClusterCitesAnInspectedObservation`, requires each `evidence_cluster` to cite ≥1 observation id present in the receipt. If the model authors the ledger from summaries alone, the run fails loud with `observation_fetch_unused`, naming the clusters.

Why ≥1-per-cluster and not "every cited id must be fetched": the former is a structural property of the run (set arithmetic over runtime-owned records) and is therefore hard-blockable; the latter would over-constrain a legitimate pattern where one inspected observation anchors a claim that a sibling's summary corroborates. The uninspected-citation list still ships as a **non-blocking disclosure** on the ledger, which is where a semantic quality concern belongs.

## Provenance & determinism

**Provenance (C1) is untouched, and the argument is structural, not procedural.** Evidence ids still resolve against the same `source-observations.yaml`; the tool mints nothing (C2) and its response is a subset of today's pushed projection. The one real hazard is the *widened* offered set — a fetched id is now legitimately citable although it was never in the pushed detail. That is not a provenance weakening: it was always a real, runtime-minted observation. It is a **catalog-scope** change, and it is exactly why the widening must be a rename of the existing gate rather than its removal.

**What survives.** The reuse key's soundness claim is *"the key covers everything the runtime supplies that can change the output."* Under fetch that still holds, because the runtime supplies (a) the offered set — a deterministic function of the observations artifact, already covered by `content_sha256` + adapter version in the Layer-1 pre-image, and (b) the rules: tool schema version, per-call cap, budget formula, and the `one_line` push pin. **(b) must be folded into the pre-execution pre-image** (ⓑ in `llm-touch-fingerprint.ts`), so retuning a cap rotates the key. All of it is pre-execution config — no circularity.

**What does not survive, precisely.** "Same key ⇒ the model saw the same material" is gone. What remains is "same key ⇒ the model was *offered* the same material under the same rules." The gap is the model's own selection.

**This is acceptable, and here is the argument.** The lost property was already not true in the strong sense: an LLM dispatch is nondeterministic, so identical prompts never guaranteed identical artifacts. What the key actually gates is *reuse* — "skip this call and take the previous artifact" — and reuse stays sound because the previous artifact is itself a gate-passing output over the same offered set under the same rules. If anything the direction of error is favorable: reusing an artifact authored after a deep fetch is better than re-authoring after a shallow one.

**Fetched ids must never enter a gating key.** They are in-epoch LLM output (ⓒ) — the model chose them — and folding them in is precisely the self-gating circularity `assertGatingKeyExcludesInEpochOutput` exists to prevent (`llm-touch-fingerprint.ts:158`). So: add `fetched_observation_ids` to `LLM_TOUCH_IN_EPOCH_OUTPUT_FIELDS` (`:130`). That closes the class with the existing recursive guard instead of a comment — and that file's own note says the denylist fails **open** for every vocabulary it has not learned.

**Where fetched ids do go (D2).** Three places, all runtime-owned:
1. `observation-fetch-receipt.jsonl` in the session dir — the primary record, written by the serving path.
2. Folded into the per-attempt row in `execution-telemetry.ts` as `fetched_observation_ids` / `fetched_chars`, which already carries `promptChars` and rides into the run manifest and the pipeline execution ledger. Reuse, not a new artifact.
3. A disclosure block on `answer-support-ledger.yaml`: `{ fetched_observation_ids, uninspected_cited_ids, fetch_budget_exhausted, fetch_realization: "model_selected_within_offered_set" }` — the honesty label mirrors the existing `declared_closure_only` pattern so no consumer reads reuse-key-match as "read the same bytes."

Per D2, browse/search queries are not recorded — the tool has none to record.

## Worker tool surface (C5)

**The packet understates this.** Verified against the operator's live `~/.codex/config.toml`: the worker today inherits `mcp_servers.onto` (so `onto_reconstruct` — the recursion hazard), plus `day1-mcp` (Google Sheets/Docs/Drive **write** tools and BigQuery), `node_repl`, `openaiDeveloperDocs`, and a disabled `computer-use`. The `-s read-only` sandbox pinned at `llm-caller.ts:947` constrains **model-issued shell commands only** — it does not constrain MCP tool calls. So the current exposure is not merely recursion: it is arbitrary external side effects on the operator's Google Workspace, from a worker whose normal job is ingesting untrusted third-party source text. The claude route already closed its equivalent gap (`--strict-mcp-config --mcp-config '{"mcpServers":{}}'`, `llm-caller.ts:1181`); the codex route did not.

Three independent structural layers, each verified against installed codex-cli 0.145.0:

1. **`--ignore-user-config`** on `codex exec` — `$CODEX_HOME/config.toml` is not loaded at all; auth still resolves. The operator's entire server list disappears; only servers the runtime injects via `-c` exist. This is the primary control and it is worth shipping **alone, before anything else in this design**.
2. **A `worker` tool profile that gates dispatch, not advertisement.** `ONTO_MCP_PROFILE` today only filters `tools/list` (`server.ts:819`) while `callTool` switches on name with no profile check (`server.ts:1640`) — deprecated aliases are documented as "not advertised, still callable." An advertise-only filter is therefore **not** a control. The `worker` profile must reject dispatch of every tool outside its one-member set, so even a model that guesses `onto_reconstruct` by name is refused by the server it is talking to.
3. **`enabled_tools=["onto_observation_read"]`** on the injected server — client-side filtering, confirmed present in the config schema (`codex mcp get <name> --json` reports `enabled_tools` / `disabled_tools`) and confirmed honored under `-c` override.

Layer 1 removes the servers; layer 2 makes the surviving server incapable; layer 3 makes the client not even offer it. None of them is a prompt instruction.

**Residual, stated plainly:** the model retains a read-only shell, so it can read files the fetch tool would not serve. That does not breach C1 (citations still must resolve) and does not breach C2, but it does mean the receipt is a record of *tool* reads, not of everything the model read. Do not describe it as a complete audit.

## Failure modes & detection

| # | failure | detection | class |
|---|---|---|---|
| 1 | Server never started (config typo, `onto` not on the path) | receipt file **absent** after the dispatch — the server creates it at startup before serving | `observation_fetch_unavailable` |
| 2 | Model never called the tool | receipt present but **empty** | `observation_fetch_unused` |
| 3 | Model authored from summaries only | ≥1 cluster with no fetched citation | `observation_fetch_unused` (blocking) |
| 4 | Fetch storm / budget spent | `budget_exhausted` returned; `fetch_budget_exhausted: true` on the ledger disclosure | non-blocking disclosure |
| 5 | Receipt unwritable | server refuses every call at startup → collapses to #1 | `observation_fetch_unavailable` |
| 6 | Stale server from a prior dispatch answers | nonce mismatch on receipt lines | `observation_fetch_receipt_nonce_mismatch` |
| 7 | Hallucinated observation id | `unknown_observation_id`, whole call fails, id named | model-visible error |
| 8 | Fetched detail inflates the worker's context past the fold's saving | telemetry `fetched_chars` vs `promptChars` per attempt; budget is the hard stop | measurable, non-blocking |
| 9 | A *new* unbounded surface appears elsewhere | unchanged: the always-on backstop at `llm-caller.ts:909` still fails loud with the actual size | existing |
| 10 | Injected instructions in analyzed source text steer the worker | bounded by the three layers above; **not detectable** once inside — mitigation only | residual |

The split of #1 from #2 is the point of the design's audit shape: without a startup-created receipt, a misconfigured server and a lazy model are the same symptom, and the run would be blamed on the model.

## Staged plan

**Stage 0 — pin the codex worker's config surface. Ships alone, no prompt change.**
Add `--ignore-user-config` to the argv in `callCodexCli`. Always-on, matching the precedent of the always-on `-s read-only` pin two lines above it.
*Verify:* unit assertion on the argv; **live negative control** — one cheap dispatch asking the worker to list its available tools, before and after. Before must name `onto` / `day1-mcp`; after must name none. A green that cannot distinguish those two states is not a check.
*Risk:* an operator whose codex model routing lives in `config.toml` (custom `model_providers`) breaks. Detected by the same live probe returning a dispatch failure.

**Stage 1 — the worker profile and the tool, inert. Nothing adopts it.**
`ONTO_MCP_PROFILE=worker` gating **dispatch**; `onto_observation_read`; the session/receipt/budget/nonce env contract; receipt-at-startup.
*Verify:* protocol test that the worker profile advertises exactly one tool **and refuses `onto_reconstruct` at dispatch** (negative control — this is the one that would otherwise pass vacuously, since advertisement filtering already exists); unknown-id / too-many-ids / budget-exhausted unit tests; a live probe confirming codex spawns MCP servers with write permission for the receipt (this is the one assumption I cannot settle statically).

**Stage 2 — wire the answer-support surface behind `reconstruct.execution.observation_fetch` (default OFF).**
Push pin at `one_line`; 64-cap lifted; offered-set rename; budget computed as the remainder; receipt → telemetry → ledger disclosure; `fetched_observation_ids` added to the in-epoch denylist; caps folded into ⓑ.
*Verify:*
- **OFF byte-identical**, proven by diff and by the existing `prompt-projection-parity` test.
- **Deterministic replay over the persisted real 59-file artifact** — the definitive check, not a fixture: OFF must still throw at 1,361,154 chars; ON must push ≤ ~30 K with all N ids present. Assert catalog cardinality > 0 before any "no id was dropped" claim.
- **Negative controls with a mock worker:** never fetches → run FAILS `observation_fetch_unused`; fetches a bogus id → `unknown_observation_id`; receipt deleted before the assertion → `observation_fetch_unavailable`, *not* `unused`.
- **Live N=1 on real codex:** receipt non-empty, fetched ⊆ offered, ≥1 fetched citation per cluster, wall time inside the 600 s per-dispatch deadline.

**Stage 3 — boundary with alternative (b), deliberately narrow.**
Do **not** fetch-enable the remaining 13 surfaces. Give the shared projector a single default `codeInventoryCharBudget` well below 40 000 so every count-scaling surface is detail-bounded at one place, and reserve fetch for the 2–3 surfaces where evidence citation *is* the product. Wiring 13 surfaces one at a time is the same instance-by-instance defect that produced this problem.

**What would falsify this design.** On the real 59-file corpus with fetch ON: (a) the run still overflows; (b) fetch-per-cluster stays at the floor of 1 across clusters, meaning the model satisfies the gate ritually and authors from summaries — the gate then buys compliance, not inspection, and the honest response is to push detail for prioritized observations instead; (c) round-trip latency pushes the dispatch past the 600 s deadline; (d) ledger quality drops against an OFF baseline **on a common basis** — the same corpus subset small enough to run OFF, compared cluster-for-cluster, not corpus-for-corpus.

## Disagreements

1. **"D3's surface has no fold and is unbounded" is wrong in a way that changes the fix.** Verified: that call is count-capped at `ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT = 64` with a 500-char excerpt cap (`authoring-prompt-payloads.ts:1847`, `:1849`). What is unbounded is **per-observation detail** — `CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET = 40_000` (`:1775`). Its worst case is 64 × 40 000 = 2 560 000 chars, 2.4× the ceiling, which is why it overflowed at 1 361 154. The scaling axis is detail × count, not count. That is why Stage 3 is a shared **detail** budget, and why fetch is the mechanism that makes a small detail budget tolerable rather than a replacement for one.
2. **The same surface has a breadth defect the packet does not mention**, and it is arguably worse than the size problem: past slot 64 supplemental observations are silently dropped, and >64 prioritized observations hard-crash the run (`:514`). Fetch mode fixes both by lifting the cap. If size were the only motive, alternative (a) would be adequate; it is not.
3. **C5 is materially understated** — see Worker tool surface. `day1-mcp` gives the worker write access to the operator's Google Workspace, and `-s read-only` does not cover MCP. Stage 0 should ship independently of whether this design is adopted at all.
4. **(c) does not remove the overflow class, and the packet's framing risks implying it does.** Fetch bounds the surfaces that adopt it. The always-on backstop remains load-bearing for the rest. Both are required.
5. **D2 as written is satisfiable, but do not call it an audit of what the model read** — the read-only shell remains. Record it as "tool reads," and say so in the disclosure label.
6. **One packet framing I would strengthen:** C3 is stated as a prohibition ("must not become a general filesystem reader"). Any design that keeps a path parameter and validates it satisfies C3 by enforcement; the design above satisfies it by having no expressible path. That difference is the whole point of the capability-boundary principle and should be a stated requirement, not an implementation preference.

## Open questions

1. **Does codex spawn MCP servers outside the read-only sandbox?** The receipt write depends on it. High confidence (the sandbox wraps model-issued shell, not codex's own child processes), but it is load-bearing. *Cheapest settle:* Stage-1 live probe — spawn the worker server under a real `codex exec -s read-only` dispatch and check the receipt file exists. If it does not, fall back to a loopback `streamable_http` server owned by the runtime (confirmed supported: the config schema carries `url` / `bearer_token_env_var` / `http_headers`), which keeps the audit in-process.
2. **Does the worker's context window bind before the stdin-derived budget?** The budget uses the stdin ceiling as a conservative proxy for total context. *Cheapest settle:* one scripted N=1 that fetches until exhaustion and records where output quality degrades against `fetched_chars`. Retune the constant from that, not from a guess.
3. **Round-trip cost.** Each fetch is a model turn inside one codex session. Unknown how many turns a 59-observation ledger takes and whether that fits 600 s. *Settle in the Stage-2 live N=1* — it is already instrumented by `execution-telemetry`.
4. **Does `--ignore-user-config` break the owner's own routing?** *Settle:* the Stage-0 live probe on the owner's machine, before anything else lands.
5. **Is `enabled_tools` filtered client-side before the model sees the tool list, or only enforced at call time?** Config-level support is verified; behavior is not. It matters only as layer 3 of 3, so it does not block — but the Stage-1 probe should record which.
6. **Which other surface adopts fetch second?** I would pick by measurement, not by size: the surface whose *citations* are most load-bearing. The seed-claim projection is the likely answer; settle by counting `evidence_observation_ids` per surface in a persisted real session.
