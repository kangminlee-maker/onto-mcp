## Direction

Add `reconstruct_observation_fetch` as the only MCP capability exposed to a tool-enabled ledger worker; it serves deterministic, paged detail from one pinned observation snapshot. Push the existing `one_line` catalog for every observation, while withholding `structural_data` until fetched. Authorize access through a short-lived, dispatch-scoped server grant, with no session identifier or path accepted from the model. Require every cited observation to have been fetched during that dispatch, and record served IDs independently of the model’s output. Disable pre-execution reuse for tool-enabled calls and replace it with a post-execution read-set fingerprint; identical live reruns are intentionally no longer promised.

## Tool contract

### Name and scope

`reconstruct_observation_fetch`

This is correctly split from the session-status tool: it has different authority, lifecycle, response budgeting, audit behavior, and failure modes. It reuses the existing observation envelope, detail representation, hashes, artifact reader, dispatch audit record, and global size limit.

The tool reads only persisted observations in the snapshot bound to its MCP connection. It cannot capture sources, create observations, update them, search files, or accept source paths.

### Inputs

The input schema is a strict `oneOf`:

```json
{"observation_ids": ["obs-001", "obs-017"]}
```

or:

```json
{"cursor": "opaque-continuation-token"}
```

Rules:

- `observation_ids` contains 1–16 unique IDs.
- A cursor and IDs cannot appear together.
- IDs are normalized into catalog order before reading.
- There is no `session_id`, `source_ref`, path, glob, query, detail level, or caller-selected byte limit.
- The cursor is MAC-bound to the dispatch grant, snapshot digest, normalized ID set, and next structural position. It cannot be used by another worker or against another snapshot.

More than 16 IDs is `INVALID_ARGUMENT`; the caller must split the request. An ID absent from the bound snapshot, including an ID belonging to another session, produces the same all-or-nothing `OBSERVATION_UNAVAILABLE` error to avoid cross-session enumeration.

### Outputs

A successful result is one page:

```json
{
  "snapshot_digest": "sha256:...",
  "observations": [
    {
      "observation_id": "obs-001",
      "source_ref": "...",
      "content_hash": "sha256:...",
      "location": {},
      "structural_data_segments": [
        {
          "pointer": "/symbols/12",
          "value": {}
        }
      ],
      "observation_complete": false
    }
  ],
  "next_cursor": "opaque-token-or-null",
  "returned_bytes": 81342,
  "remaining_fetch_bytes": 391207,
  "remaining_fetch_calls": 19
}
```

`structural_data_segments` are emitted in the observation’s existing canonical order. Normal records retain their native JSON value. A scalar too large for one page is split into UTF-8 fragments carrying its JSON pointer, byte offsets, and a final-fragment marker, so even one abnormally large observation remains retrievable.

The tool generates no summaries or interpretations. It verifies each persisted observation’s content hash before serving it.

### Size bounds

The initial implementation uses:

- Maximum encoded MCP result: 131,072 UTF-8 bytes, including the envelope.
- Maximum successful-result bytes per dispatch: 524,288.
- Maximum tool invocations per dispatch, including errors: 24.

The dispatcher further reduces the aggregate allowance to:

```text
min(
  524,288,
  dispatch_size_limit
    - measured_initial_request_bytes
    - 262,144 bytes of CLI/tool/final-turn reserve
)
```

These values are internal protocol constants, not model inputs or user configuration.

A request whose content exceeds one result page returns the largest complete deterministic page plus `next_cursor`; it never silently truncates. If the remaining dispatch allowance cannot hold a useful segment and its envelope, the tool returns `FETCH_BUDGET_EXHAUSTED` with no observation data. The call-count limit prevents repeated errors or cursor loops from growing the worker transcript indefinitely.

### Session addressing

Before spawning the worker, the runtime:

1. Pins the ordered persisted observation artifact and derives its snapshot digest.
2. Creates a random, short-lived read grant bound to the dispatch-attempt ID, snapshot digest, operation name, byte budget, call budget, and dispatch deadline.
3. Supplies that grant to the runtime-owned MCP façade through the connection configuration, not through the prompt or tool arguments.
4. Revokes it when the worker exits.

The façade resolves the snapshot through the artifact store, not through a caller-provided filesystem path. New observations captured concurrently are invisible to that worker; they require a new dispatch and catalog. A missing or modified pinned artifact is an integrity failure, never a switch to the session’s latest state.

### Error behavior

Errors use the runtime’s existing validation, authorization, resource-exhaustion, integrity, and dependency failure classes, with these fetch-specific reasons:

- `INVALID_ARGUMENT`: malformed input, duplicate IDs, too many IDs, or IDs supplied with a cursor.
- `OBSERVATION_UNAVAILABLE`: any requested ID is not in the bound snapshot.
- `INVALID_CURSOR`: malformed, replayed outside its grant, or snapshot-mismatched cursor.
- `GRANT_EXPIRED`: the dispatch ended or its deadline passed.
- `FETCH_BUDGET_EXHAUSTED`: aggregate byte or call allowance is exhausted.
- `OBSERVATION_INTEGRITY_FAILURE`: persisted bytes do not match their recorded hash.
- `AUDIT_UNAVAILABLE`: a fetch receipt could not be durably recorded.
- `DEPENDENCY_UNAVAILABLE`: the scoped façade or artifact store is unavailable.

Validation and authorization errors return no partial observation data.

## What stays pushed

Every ledger prompt retains an all-observation discovery catalog. Its target representation is the existing `one_line` projection, including at least `observation_id`, `source_ref`, and summary; this is the measured small layer suitable for choosing what to inspect.

The prompt also includes:

- Observation count and pinned snapshot digest.
- The intent, competency questions, and normal ledger authoring inputs.
- The exact tool name and fetch budget.
- The rule that catalog summaries are discovery hints, not sufficient evidence for citation.

The catalog is budgeted through the existing breadth fold. If all `one_line` entries do not fit, entries are deterministically demoted through `summary_anchor` and then `anchor`, while retaining every observation. The minimum `anchor` representation must contain `observation_id` and `source_ref`; that is asserted in code.

The dispatcher first proves that the fixed prompt plus every anchor fits, then spends remaining catalog capacity upgrading toward `one_line`. If the complete anchor catalog does not fit, dispatch fails before starting the worker with `CATALOG_UNREPRESENTABLE`. The runtime must not truncate the catalog, hide observations, or ask the model to guess IDs; bounded catalog search is a separate future design.

The prompt directs the model to:

1. Select candidates from the pushed catalog.
2. Fetch the smallest relevant ID set.
3. Follow continuations only until it has the detail needed.
4. Cite only observations for which detail was successfully returned.
5. Stop fetching when the tool reports little remaining budget.

Instructions encourage the workflow; validation enforces it. For this ledger surface, a nonempty observation snapshot requires at least one successful detail fetch. Every `evidence_observation_id` must be both present in the pinned snapshot and included in that dispatch attempt’s fetched-ID set. Ignoring the tool therefore produces a contract rejection, not a runtime-authored repair.

## Provenance & determinism

The tool serves only existing observation data and returns the existing `observation_id`, `source_ref`, `location`, and content hash. Page segments and cursors are transport projections, not new evidence entities, and cannot be cited. Existing unknown-ID rejection remains in force, strengthened by the requirement:

```text
cited observation IDs ⊆ fetched observation IDs ⊆ pinned snapshot IDs
```

A fetched ID means the MCP façade returned at least one `structural_data` segment for it. Metadata-only responses and failed calls do not qualify. Fetching only part of an observation does not change the observation-level citation model; semantic support remains the authoring model’s responsibility, as it is today.

Fetched data is recorded in the existing per-dispatch-attempt audit record, not in the immutable observation artifact:

```json
{
  "observation_fetch": {
    "snapshot_digest": "sha256:...",
    "fetched_observation_ids": ["obs-001", "obs-017"],
    "observation_content_hashes": {
      "obs-001": "sha256:...",
      "obs-017": "sha256:..."
    },
    "page_receipts": [
      {
        "served_ranges": [],
        "semantic_response_digest": "sha256:..."
      }
    ],
    "bytes_served": 173804,
    "calls": 3
  }
}
```

`fetched_observation_ids` is the sorted unique union of IDs actually served, whether or not cited. Page receipts contain deterministic ranges and hashes, not search strings; the tool has no search operation. Failed dispatches retain their fetch audit.

The façade durably records a receipt before releasing observation data. If that write fails, it returns `AUDIT_UNAVAILABLE` instead. This may conservatively record a response that was emitted immediately before a transport failure, but it cannot silently omit data made available to the worker.

Tool-enabled calls must not read or populate the legacy cache under the pre-dispatch prompt fingerprint. Their completed execution fingerprint is:

```text
H(
  existing deterministic input fingerprint,
  tool-contract version,
  snapshot digest,
  ordered semantic page-response digests,
  sorted (fetched observation ID, observation content hash) pairs
)
```

Grant tokens, expiration times, opaque cursor bytes, and budget counters are excluded. The completed fingerprint can compare or verify recorded executions, but it is unavailable for a cache lookup before the model chooses what to fetch.

The surviving reproducibility property is post-execution dependency reproducibility: an accepted artifact identifies its deterministic pushed input, observation snapshot, exact fetched structural ranges, content hashes, and output. The persisted observations can reproduce and verify the semantic tool responses.

What is lost is stronger: identical initial inputs no longer guarantee the same fetch sequence, model context, output, or pre-execution reuse hit. That loss is acceptable for the first tool-enabled surface because dependency completeness and provenance remain enforceable, while pretending the old prompt-only key is sound would permit incorrect reuse. Exact execution replay would require a later recorded-trace replay mode; it is not part of the minimum functional path.

## Worker tool surface

Each tool-enabled dispatch uses a generated, isolated Codex configuration that replaces rather than merges with the operator’s normal MCP configuration. Its advertised MCP tool set must equal:

```text
{ reconstruct_observation_fetch }
```

The runtime performs an MCP initialization handshake and compares the returned tool names against that exact allowlist before sending the authoring prompt. Any extra or missing tool aborts the dispatch. In particular, the status tool, reconstruct-starting tool, plugin discovery, and the operator’s other MCP servers are absent.

The façade implements only the fetch method. Inventing another method or attempting recursion returns method-not-found before reaching the broader runtime.

The worker also runs:

- In a fresh empty working directory.
- Under the existing read-only sandbox and noninteractive approval policy.
- Without inherited session-artifact paths or general MCP credentials.
- With a sanitized environment containing only the scoped connection material and required CLI variables.

Possession of the grant gives access only to the pinned snapshot through this one operation. Even if the model exposes the token through a read-only local command, it gains no additional authority.

If the installed `codex exec` version cannot reliably replace inherited MCP configuration, this design must not ship. Prompting the model not to call dangerous tools is not an acceptable substitute.

## Failure modes & detection

| Failure | Detection and result |
|---|---|
| Model ignores the tool | Nonempty-fetch requirement and cited-subset validation reject the ledger. |
| Model cites a real but unfetched ID | Reject with an output-contract violation identifying the unfetched ID; do not amend the citation. |
| Model invents an ID | Existing observation-resolution gate rejects it. |
| Cross-session or guessed ID | Tool returns `OBSERVATION_UNAVAILABLE` with no partial data; security telemetry records the reason, not another session’s existence. |
| Oversized request | Deterministic page plus continuation; encoded response size is asserted before release. |
| One huge structural value | UTF-8 fragment paging proves forward progress; a fixture larger than one page is required. |
| Aggregate transcript growth | Byte and call budgets terminate fetching with `FETCH_BUDGET_EXHAUSTED`. |
| Catalog itself is too large | Predispatch anchor-fit check returns `CATALOG_UNREPRESENTABLE`; no observations are dropped. |
| Cursor used against another worker or snapshot | MAC validation returns `INVALID_CURSOR`. |
| Observation artifact changes during the call | Snapshot or content-hash verification fails; the tool never reads “latest.” |
| Audit persistence fails | `AUDIT_UNAVAILABLE` is returned before observation detail is released. |
| Tool server is unavailable | Structured dependency failure propagates to the dispatch; model output cannot pass the fetch requirement. |
| Worker sees a dangerous MCP tool | Startup allowlist comparison fails before the prompt is sent. |
| Worker loops or repeatedly retries errors | Invocation limit is consumed and visible in the attempt audit. |
| Worker/provider still rejects an oversized internal request | Record initial bytes, tool bytes served, call count, and provider error; disable the feature rather than silently falling back to full payloads. |
| Legacy cache returns a prompt-only result | A runtime assertion forbids legacy cache lookup on tool-enabled attempts; a poisoned-cache negative test verifies this. |
| Tool output truncates without continuation | Internal response validation fails unless every incomplete observation has a valid continuation cursor. |

## Staged plan

| Stage | Implementation | Verification |
|---|---|---|
| 0. Characterize and gate | Preserve the 59-observation artifact as a fixture. Add a default-off dispatch feature using the existing feature-gate mechanism. | Assert the fixture is nonempty and contains nonempty `structural_data`. With the feature off, compare serialized prompts and reuse keys byte-for-byte against the baseline. |
| 1. Pure artifact reader | Implement pinned-snapshot lookup, hash verification, deterministic structural segmentation, paging, and cursors without exposing it to Codex. | Reassemble every observation from pages and compare it byte-for-byte with the persisted canonical form. Assert every result is at most 131,072 bytes. Include an oversized-scalar negative control. |
| 2. Scoped grants | Add dispatch-bound grants, aggregate budgets, expiration, and same-error handling for unknown and cross-session IDs. | Create sessions A and B with known distinct IDs; prove A’s grant cannot fetch B’s ID, use a cursor, or address an artifact path. Verify expired grants fail. |
| 3. MCP isolation | Launch the worker with the replacement configuration and one-method façade. | Run an adversarial worker prompt that enumerates tools and attempts the reconstruct-starting tool. Assert the enumerated set is nonempty and exactly the singleton allowlist. |
| 4. Ledger adoption | Replace ledger `structural_data` input with the existing all-observation `one_line`/fold projection. Add the fetch instructions and cited-subset validator. | A stub worker that never fetches must fail. A stub that fetches and cites that ID must pass. A stub that fetches A but cites B must fail. Feature-off output remains byte-identical. |
| 5. Audit and fingerprint | Extend the per-attempt audit with fetched IDs, content hashes, page receipts, and aggregate counts. Disable legacy pre-execution reuse for enabled calls. | Fetch detail and then crash the worker; the failed attempt must retain its served IDs. Force audit persistence failure and prove no detail is returned. Identical recorded traces produce the same completed fingerprint; changed fetched content or page order changes it. |
| 6. Real benchmark | Run the tool-enabled ledger call on the original 59-file corpus using the fixed worker seat and transport. | Require completion without a provider size rejection, 100% resolution of cited IDs, cited IDs as a subset of audited fetched IDs, and every tool result within its limit. Compare ledger coverage against a smaller full-detail reference corpus. |
| 7. Class-wide guardrail | Route every count-scaling authoring projection through a shared budget/detail-policy layer. Direct unbounded `structural_data` serialization becomes invalid unless a surface explicitly selects a bounded fold or scoped fetch. | Re-run the AST inventory, first asserting the set of authoring call sites is nonempty. Add a deliberately unbounded fixture call and prove the check fails before declaring the remaining set clean. |
| 8. Rollout | Enable only the answer-support ledger surface, retaining a rapid feature disable. Expand tool adoption only where interactive detail is semantically necessary. | Canary real sessions and compare prompt-size distribution, fetch-budget exhaustion, contract rejection rate, evidence coverage, and worker failures against the disabled path. |

The design is falsified if any of the following occurs: the 59-file benchmark still exceeds the provider limit within the stated budget; a worker can reach another session or any non-allowlisted tool; served IDs can be absent from the audit; pagination cannot retrieve an individual observation; the disabled path changes bytes; or evidence coverage materially degrades against a full-detail control.

## Disagreements

D3 is a correct rollout order but an insufficient root-cause fix. If only the ledger surface changes, the benchmark history says another unbounded surface will eventually become the failure point. The shared count-scaling guardrail in stage 7 is therefore required, even though tool adoption remains surface-by-surface.

Fetch-on-demand is not inherently bounded. Tool responses accumulate in the worker’s conversation, so a per-response limit without an aggregate dispatch allowance merely moves the overflow inside `codex exec`.

Fetched IDs alone are insufficient for a sound dynamic-input fingerprint when observations can be paged. The audit must retain content hashes and compact page receipts as well; this does not resurrect costly search-query logging because the proposed tool has no search queries.

“Actually fetched” cannot literally mean that the model cognitively read or used returned bytes. The enforceable boundary is that the runtime-owned façade successfully made observation detail available to that dispatch. If D2 intends a stronger definition, it is impossible to implement reliably.

Prompt-only reproducibility and live model-directed fetching are incompatible. If identical initial inputs must always yield an identical read set, decision (c) is wrong unless the system replays a previously recorded trace or moves selection back into deterministic runtime code.

Reducing the corpus is not an automatic fallback. It would weaken the measurable product claim and silently alter the ontology’s evidence universe; it should occur only as an explicit operator decision after `CATALOG_UNREPRESENTABLE`.

## Open questions

- Whether the current observation artifact is immutable or content-addressed. Inspect its persistence path and mutation API; if it is mutable in place, snapshot pinning must be added before the tool.
- Whether the installed CLI can fully replace inherited MCP configuration. Test the exact production invocation with MCP enumeration; failure blocks rollout.
- How much hidden request overhead `codex exec` adds around tool transcripts. Capture reported provider request sizes across controlled 64, 128, 256, and 512 KiB fetch traces to validate the 262,144-byte reserve.
- The corpus-wide distribution of individual observation and scalar sizes. Measure persisted artifacts to validate page packing and estimate typical calls per ledger.
- Whether the existing ledger schema permits a valid “no supporting evidence” result. Inspect its validator to ensure the mandatory first fetch does not conflict with legitimate unsupported answers.
- The nearest existing names for dispatch audit fields, artifact digests, feature gates, and failure reasons. Resolve these by inspecting their definitions before adding schema names; the behavioral contract above should remain unchanged.
