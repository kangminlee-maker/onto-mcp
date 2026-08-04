# Onto MCP

[![npm version](https://img.shields.io/npm/v/onto-mcp)](https://www.npmjs.com/package/onto-mcp)

MCP-native ontology tools that help LLMs **review an artifact's ontological
integrity** — the logical consistency of its concepts, authority, and purpose —
and **derive an ontology** from real sources, with runtime validation gates
owning every structured claim.

```text
.onto contracts and domain documents
        -> TS review/reconstruct runtime
        -> core API facade
        -> MCP tools
        -> provider adapters
```

The public interface is MCP-native: install the server once, register it with
your MCP host, and drive it through tools. Targets are not assumed to be code —
runtime contracts classify the material form (`code`, `spreadsheet`,
`document`, `database`, `mixed`, or `unknown`) before choosing observation,
validation, or adapter behavior.

## What you can do with it

Point an LLM host at the server and drive it through tools to:

- **Review an artifact for ontological integrity** — check that its *concepts,
  authority, and purpose* stay logically consistent (do definitions, authority
  seats, and stated goals agree?). The artifact can take any form — code, a
  spreadsheet, a document, a database, or a mixed bundle; the form is just the
  layer the ontology is read through. Independent lenses, controlled
  deliberation, and conservative synthesis; findings surface as *material
  issues*. → `onto_review`
- **Derive a domain ontology from real sources** — reconstruct a bounded,
  validated ontology seed from an actual codebase / spreadsheet / document and
  mature it until it is actionable. → `onto_reconstruct`

**Use this when** your goal is to *check whether an artifact holds together
conceptually* — the logical / ontological integrity of its concepts, authority,
and purpose — or to *derive a structured domain ontology from real sources*, and
you want every structured claim owned by a runtime validation gate (fail-loud,
not best-effort). Code is in scope because code only works if it is logically
consistent.

**Not the right fit for** linting/formatting, running tests, one-shot chat
summaries, freeform generation, or adversarial hunting for operational/runtime
bugs (edge cases, crashes, performance) — that last one is complemented by a
separate adversarial multi-perspective tool.

| If your goal is… | Use |
|---|---|
| Check an artifact's concept / authority / purpose consistency (any form: code, spreadsheet, document, DB) | `onto_review` (then `onto_review_read` for results) |
| Derive / reconstruct a domain ontology from real sources | `onto_reconstruct` (then `onto_reconstruct_read`) |
| Discover available lenses, domains, or source profiles | `onto_list` |

## Quickstart

```bash
npm install -g onto-mcp
onto register            # interactive: pick detected MCP hosts
```

`npm install` only puts the `onto` binary on PATH — each MCP host (Claude Code,
Codex, Claude Desktop, Cursor) must additionally be told to launch it. `onto
register` does that in one step; the same global binary is shared by every
host. Restart the host app after registering.

```bash
onto register --all --yes                # non-interactive: every detected host
onto register --hosts cursor,codex --yes
onto register --list                     # show detection status, write nothing
onto register --hosts cursor --dry-run   # preview the change, write nothing
```

| Host | How it is registered |
|---|---|
| Claude Code | `claude mcp add onto -s user -- onto mcp` (user scope = all projects) |
| Codex CLI | `codex mcp add onto -- onto mcp` |
| Claude Desktop | edits `mcpServers.onto` in `claude_desktop_config.json` |
| Cursor | edits `mcpServers.onto` in `~/.cursor/mcp.json` |

For the CLI-backed hosts, `onto register` prefers the official CLI and falls
back to printing manual instructions when it is not on PATH. It verifies the
result after `mcp add` and reports `failed` (not a false `registered`) if the
CLI exits successfully but the server is not listed afterward. JSON edits
preserve any servers already present and are idempotent. Registration writes
only host-owned config; it never writes onto runtime data. Override the
launched command or server name with `--command <cmd>` / `--name <id>`.

**Claude Code profiles.** Claude Code stores MCP servers per config directory
(`CLAUDE_CONFIG_DIR`). To register every profile in one command, let `onto`
discover them — it scans `~/.claude` and `~/.claude-*` for real config dirs
(those carrying `settings.json`, `.credentials.json`, `.claude.json`, or
`projects/`) plus any ambient `CLAUDE_CONFIG_DIR`, and registers each:

```bash
onto register --hosts claude-code --all-claude-profiles --yes  # every profile
onto register --all --all-claude-profiles --yes                # profiles + other hosts
onto register --all-claude-profiles --list                     # preview discovered profiles
```

To target a single profile instead, name it explicitly (mutually exclusive with
`--all-claude-profiles`):

```bash
onto register --hosts claude-code --claude-config-dir ~/.claude-1 --yes
```

For project-local installs:

```bash
npm install --save-dev onto-mcp
npm exec -- onto mcp
```

Before running reviews, configure an LLM provider in `.onto/settings.json` or
`~/.onto/settings.json` (see [Configuration](#configuration)).

## onto CLI

The `onto` binary exposes a small set of commands; the actual product work is
driven through the MCP tools by your host.

| Command | What it does |
|---|---|
| `onto mcp` | Start the MCP stdio tool server — each MCP host launches this (see [Quickstart](#quickstart)) |
| `onto register` | Register the server into supported MCP hosts (see [Quickstart](#quickstart)) |
| `onto configure-provider` | Write LLM provider/model settings into the settings.json chain (see [Configuration](#configuration)) |
| `onto seats` | Print a read-only inventory of every LLM model seat the runtime can dispatch, resolved against the settings.json chain (`--json` for machine output); writes nothing |
| `onto watch [session]` | Open a live, read-only TUI over a review/reconstruct session — pass a session id substring or path, or omit it for the most recent (see [Observing a run](#observing-a-run)) |

## What it does

### Review

`onto_review` runs a structured, multi-perspective review of a target:

1. invocation interpretation and binding
2. execution preparation artifacts
3. isolated parallel lens execution (context-isolated perspectives)
4. issue ledger and issue stance closure artifacts
5. controlled lens deliberation
6. conservative synthesis
7. `ReviewRecord` assembly
8. concise human-readable final output

Two orchestration modes share one runtime: the default runtime-orchestrated
path (`onto_review` drives everything), and a host-orchestration path where the
MCP host executes units itself round by round (`onto_review_round` /
`onto_review_advance`) while onto keeps artifact truth, validation, and gates.

A review session writes artifacts under `.onto/review/<session-id>/`:

| Artifact | Purpose |
|---|---|
| `execution-plan.yaml` | bounded runtime plan |
| `issue-ledger.yaml` | normalized issue list |
| `issue-stance-matrix.yaml` | every participating lens stance per issue |
| `deliberation.md` | teamlead-controlled deliberation result |
| `problem-framing.yaml` | end-of-review problem classification |
| `review-run-manifest.yaml` | packet/output refs and hashes |
| `review-record.yaml` | primary structured review artifact |
| `final-output.md` | principal-facing report with `Final Review Result` explanation |

### Reconstruct

`onto_reconstruct` derives a bounded ontology seed from real sources and
matures it: classify target material, observe sources behind safety and
lineage gates, author and validate `ontology-seed.yaml`, then iterate a
maturation loop (question frontier → answer support → ontology expansion →
convergence) until the result is `actionable_ready`, `actionable_limited`, or
explicitly blocked. Every structured claim is owned by a runtime validation
gate; the run fails loud when provider credentials, LLM-authored artifact
shape, unsupported material, or runtime gates are invalid.

Minimal MCP call shape:

```json
{
  "name": "onto_reconstruct",
  "arguments": {
    "projectRoot": "/path/to/project",
    "targetRefs": ["src/example.ts"],
    "intent": "Create a bounded reconstruct Seed from this target.",
    "domain": "ontology",
    "sessionRoot": ".onto/reconstruct/example-run"
  }
}
```

The artifact and gate catalog authority is the machine-readable
[reconstruct contract registry](https://github.com/kangminlee-maker/onto-mcp/blob/main/.onto/processes/reconstruct/reconstruct-contract-registry.yaml);
semantics and rationale live in the prose contracts under
[`.onto/processes/reconstruct/`](https://github.com/kangminlee-maker/onto-mcp/tree/main/.onto/processes/reconstruct). A readable
point-in-time map (v0.4.7 snapshot, not maintained) is kept at
[development-records/design/reconstruct-runtime-reference-v0.4.7-snapshot.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/development-records/design/reconstruct-runtime-reference-v0.4.7-snapshot.md).

## MCP tools

| Tool | Purpose |
|---|---|
| `onto_review` | Run the full review path and return artifact refs plus summary |
| `onto_prepare_review` | Prepare a review session and prompt packets |
| `onto_review_continue` | Continue a prepared or halted review from the ledger frontier |
| `onto_review_round` | Host-orchestration: return the units ready to execute now, with prompt packets materialized |
| `onto_review_advance` | Host-orchestration: report host-executed units; onto validates seats, records results, and returns the next round |
| `onto_review_cancel` | Request cancellation for a running review session |
| `onto_review_read` | Read a review session — one entry point for liveness while running and the bounded result once complete; `projectionLevel` `compact`/`standard`/`full` (`full` adds `review-record.yaml` and final output) |
| `onto_list` | List a registry by `kind`: `lenses` (canonical lens sets), `domains` (available domain ids), or `source_profiles` (reconstruct source profiles) |
| `onto_observe_source` | Materialize reconstruct material profile, inventory, source observations, and initial record |
| `onto_validate_reconstruct_directive` | Validate LLM-authored reconstruct artifacts |
| `onto_reconstruct` | Run the material-aware direct-call reconstruct path with runtime validation gates |
| `onto_reconstruct_read` | Read a reconstruct session — stage progress, liveness, and counts, or the full record, run manifest, and final output at `projectionLevel=full` |

MCP results include `llmPresentation` prompts: the runtime supplies bounded
facts, and the host LLM uses those prompts to explain the opening brief and
final result without inventing settings or findings.

Field-by-field input and output contracts for every tool are in
[Tool contracts](#tool-contracts-input--output).

### Self-documentation

The server advertises MCP `resources` and `prompts` so a host LLM can learn
onto without external docs:

- **Resource `onto://usage`** — provider setup, the review and reconstruct
  workflows, the running-handle polling pattern, and output-size guidance.
- **Prompts** — canonical task templates `review_target` (args: `target`,
  `intent`, `reviewMode`) and `reconstruct_seed` (args: `targetRefs`,
  `intent`).

### Observing a run

`onto watch` opens a live, read-only TUI over a review or reconstruct session:
browse the workflow tree, node details, and log. Pass a session id substring or
a session path, or omit it to attach to the most recent session
(`--project-root` selects where to look for `.onto/{review,reconstruct}`). It
observes only — it writes nothing and drives nothing.

The runtime also writes a session-local `runtime-events.ndjson` stream and tries
to open a watcher automatically in a supported terminal (tmux, Warp, Cursor,
iTerm2, Apple Terminal, Codex Desktop with a configured launcher). Set
`ONTO_RUNTIME_WATCHER=0` to disable, or `ONTO_RUNTIME_WATCHER_COMMAND` with a
`{watcherCommand}` template for unsupported hosts.

## Tool contracts (input / output)

Three surfaces define the contract, each authoritative for what it owns:

| Surface | Owns | Source |
|---|---|---|
| MCP `tools/list` JSON Schema | what your host advertises and pre-validates | [`src/mcp/server.ts`](https://github.com/kangminlee-maker/onto-mcp/blob/main/src/mcp/server.ts) (`*_INPUT_SCHEMA`) |
| Zod input schemas | what the runtime actually accepts (adds cross-field rules) | [`src/mcp/tool-schemas.ts`](https://github.com/kangminlee-maker/onto-mcp/blob/main/src/mcp/tool-schemas.ts) |
| TypeScript result types | the `structuredContent` payload shape | [`src/core-api/review-api.ts`](https://github.com/kangminlee-maker/onto-mcp/blob/main/src/core-api/review-api.ts), [`src/core-api/reconstruct-api.ts`](https://github.com/kangminlee-maker/onto-mcp/blob/main/src/core-api/reconstruct-api.ts) |

Where the two input surfaces differ, the Zod schema is the effective contract:
the advertised JSON Schema is deliberately flat for
`onto_validate_reconstruct_directive` (a top-level `oneOf` is rejected by the
Anthropic tool API), and cross-field rules (`domain` vs `noDomain`,
`llmOverride.provider` requires `model`, `sessionRoot` or `latest`) are enforced
at the handler. Only `onto_list` declares an MCP `outputSchema`; the other
tools' payloads vary by `projectionLevel`, so they are documented here rather
than declared (parity with the real output is enforced by
`src/mcp/tool-surface.behavior.test.ts`).

### Result envelope

Every tool returns the same envelope. `content[0].text` is a JSON mirror of
`structuredContent` (`JSON.stringify(data, null, 2)`), so pre-`structuredContent`
hosts lose nothing.

```json
{
  "content": [{ "type": "text", "text": "{ …same JSON… }" }],
  "structuredContent": { "…tool payload…": "…" }
}
```

Errors set `isError: true`. `structuredContent` is present only when the failure
is a structured one; a plain validation/`Error` returns message text only.

| Error shape | When | `structuredContent` |
|---|---|---|
| structured failure | settings validation, retired config, domain binding, value-alignment gate, actor route, manifest lifecycle, context eligibility, provider API, malformed output, schema validation, artifact write, security disclosure | `{ failure, failureRecordPath, routeVisibility? }` |
| continuation failure | `onto_review_continue` could not complete the attempt | `{ continuationFailure }` |
| plain error | Zod rejection, path-boundary rejection, unknown tool | *(absent)* |

`failure` is a bounded projection of the session's structured failure record —
free-text values are collapsed to one line and truncated (≤360 chars; ids ≤120):

| Field | Type |
|---|---|
| `failure_id`, `phase`, `reason_code`, `mcp_error_code` | `string` |
| `human_message`, `required_user_action` | `string` |
| `retry_safety` | `safe_after_input_change` \| `safe_after_environment_change` \| `unsafe_without_operator_review` |
| `dispatch_state` | `not_dispatched` \| `dispatch_blocked` \| `partially_dispatched` \| `dispatched` |
| `details_kind` | one of the failure kinds in the table above |
| `details_signal` | `string` — the record's `details` object serialized and truncated |
| `artifact_refs` | `Record<string, string>` |

`continuationFailure` carries `mcp_error_code: "ONTO_REVIEW_CONTINUATION_FAILED"`,
`session_id`, `session_root`, `attempt_id`, `attempt_root`,
`attempt_manifest_ref`, `continuation_plan_ref`, `continuation_plan`,
`superseded_artifact_backups`, `restored_artifact_backups`, `error_message`.

### Rules that hold for every tool

| Rule | Contract |
|---|---|
| closed inputs | every input schema is `additionalProperties: false` / `.strict()` — unknown keys are rejected, not ignored |
| non-empty strings | every string field requires at least one character |
| `projectRoot` | optional on every tool; defaults to the MCP server process working directory |
| review `sessionRoot` | absolute or `projectRoot`-relative; must resolve **and realpath-resolve** inside `{projectRoot}/.onto/review`, else `ONTO_REVIEW_SECURITY_DISCLOSURE_BLOCKED` |
| reconstruct `sessionRoot` | same rule against `{projectRoot}/.onto/reconstruct`, else `ONTO_RECONSTRUCT_SECURITY_DISCLOSURE_BLOCKED` (artifact refs read out of the session are boundary-checked too) |
| reconstruct path arguments | `targetRefs[]`, `profilesRoot`, `filesystemAllowedRoots[]` and every `*Path` must resolve inside `projectRoot` |
| provider requirement | `onto_review`, `onto_review_continue` and `onto_reconstruct` execute real LLM work and fail loud with no provider configured; `onto_prepare_review` resolves the same profile, so invalid settings stop there too. The read/list/validate tools need no provider |
| writes | onto writes only under `{projectRoot}/.onto/`; it never mutates your sources |

### `onto_review`

Runs the full review path. Long-running: past the synchronous window it returns
a run handle with `status: "running"` and keeps executing in the background.

| Field | Type | Required | Notes |
|---|---|---|---|
| `target` | `string` | ✓ | file, directory, or target token |
| `intent` | `string` | ✓ | what the review should verify or decide |
| `targetScopeKind` | `"file"` \| `"directory"` \| `"bundle"` | | explicit target shape |
| `primaryRef` | `string` | | bundle primary artifact; defaults to `target` |
| `memberRefs` | `string[]` | | bundle supporting artifacts |
| `bundleKind` | `string` | | e.g. `implementation_change_bundle` |
| `diffRange` | `string` | | git diff range; materialized as the target basis |
| `projectRoot` | `string` | | defaults to the server working directory |
| `domain` | `string` | | domain id whose documents guide the review |
| `noDomain` | `boolean` | | run without domain documents |
| `reviewMode` | `"core-axis"` \| `"full"` | | lens set size |
| `lensIds` | `string[]` | | explicit lens ids; omit to use `reviewMode` defaults |
| `deliberation` | `"controlled_lens_deliberation"` | | the default path; the only accepted value |
| `executionRoute` | `"external_oauth_worker"` \| `"direct_model_call"` | | route override; normally omit |
| `confirmValueAlignment` | `boolean` | | confirms value-alignment criteria under known ambiguity |
| `prepareOnly` | `boolean` | | materialize artifacts without executing lens units |
| `returnRunningAfterMs` | `integer ≥ 0` | | synchronous wait budget; default is profile-aware (full 25s, simple 45s; env `ONTO_MCP_REVIEW_RETURN_RUNNING_AFTER_MS` / `..._SIMPLE`) |
| `llmOverride` | `object` | | see [Per-call LLM override](#per-call-llm-override-llmoverride) |

Rejected combinations: `domain` together with `noDomain`;
`llmOverride.provider` without `llmOverride.model`; any `deliberation` value
other than `controlled_lens_deliberation`.

**Output** — `prepareOnly: true` returns the prepared-session shape (same as
[`onto_prepare_review`](#onto_prepare_review)). Otherwise:

| Field | Type | Notes |
|---|---|---|
| `sessionId`, `sessionRoot` | `string` | |
| `status` | `"running"` \| `"completed"` \| `"completed_with_degradation"` \| `"halted_partial"` | `running` ⇒ poll `onto_review_read` |
| `finalOutputPath`, `reviewRecordPath`, `executionResultPath`, `reviewRunManifestPath` | `string` | canonical session paths |
| `participatingLensIds`, `degradedLensIds` | `string[]` | |
| `deliberationStatus` | `string \| null` | optional |
| `resultOverview` | `unknown` | optional |
| `artifactRefs` | `Record<string, string>` | optional |
| `pipelineExecutionLedger` | ledger projection | optional |
| `resultClassificationSummary` | classification projection | optional |
| `failureRefs` | `string[]` | optional |
| `routeVisibility` | route visibility \| `null` | optional |
| `startPreview` | `{ entrypointPlan?, routeSummary?, boundedInvokeSteps? }` | optional |
| `llmPresentation` | presentation prompts | optional |
| `runHandle` | run handle | present on the `running` return |
| `runControl` | run-control projection | optional |
| `targetMaterialSupport` | material-support projection \| `null` | optional |
| `environmentWarnings` | warning projection`[]` | optional |

```json
{
  "name": "onto_review",
  "arguments": {
    "target": "src/payments/",
    "intent": "Review the refund path for material correctness and safety issues.",
    "reviewMode": "full",
    "projectRoot": "/path/to/project"
  }
}
```

### `onto_prepare_review`

Same input schema as `onto_review`, with one difference: `prepareOnly` defaults
to `true` and `false` is rejected — this tool never executes lens units.

**Output**

| Field | Type | Notes |
|---|---|---|
| `sessionId`, `sessionRoot` | `string` | |
| `executionPlan` | execution plan artifact | the bounded runtime plan |
| `environmentWarnings` | warning projection`[]` | optional; includes which seats an `llmOverride` reached |
| `routeVisibility` | route visibility \| `null` | optional |
| `llmPresentation` | presentation prompts | |

### `onto_review_continue`

| Field | Type | Required | Notes |
|---|---|---|---|
| `sessionRoot` | `string` | ✓ | |
| `projectRoot` | `string` | | |
| `targetUnits` | `string[]` | | exact frontier unit ids; omit to use the ledger-derived frontier |
| `requestText` | `string` | | original request text, for record assembly of a prepared session |
| `executionRoute` | `"external_oauth_worker"` \| `"direct_model_call"` | | required only for a prepared session with no prior run manifest |

**Output**

| Field | Type | Notes |
|---|---|---|
| `sessionId`, `sessionRoot` | `string` | |
| `decision` | `"executed"` \| `"already_running"` | |
| `status` | review status | see [Status vocabularies](#status-vocabularies) |
| `continuationPlan` | continuation plan projection | optional |
| `continuationAttempt` | `{ attemptId, attemptRoot, continuationPlanPath, attemptManifestPath, supersededArtifactBackups[] }` | optional |
| `promptExecutionResult` | prompt execution projection | optional |
| `artifactRefs` | `Record<string, string>` | |
| `pipelineExecutionLedger`, `resultClassificationSummary` | projections | optional |
| `failureRefs` | `string[]` | |
| `routeVisibility`, `llmPresentation`, `activeAttempt` | | optional |

### `onto_review_round` / `onto_review_advance`

Host-orchestration only (`review.execution.orchestration: host`); both are
rejected for runtime-orchestrated sessions.

| Tool | Field | Type | Required | Notes |
|---|---|---|---|---|
| both | `sessionRoot` | `string` | ✓ | host-orchestrated session root |
| both | `projectRoot` | `string` | | |
| `onto_review_advance` | `executed` | `string[]` | ✓ | unit ids the host just executed, with their seats written at the plan's canonical output paths |
| `onto_review_advance` | `requestText` | `string` | | original request text used when the final advance assembles the `ReviewRecord` |

**Output** — a discriminated union on `status`:

| `status` | Extra fields |
|---|---|
| `in_progress` | `readyUnits: Array<{ unit_id, unit_kind, lens_id?, packet_path, output_path }>` |
| `ready_to_assemble` | *(none)* — returned by `onto_review_round` only; `onto_review_advance` assembles instead |
| `assembled` | `sessionRoot`, `reviewStatus` (the full [`onto_review_read` status shape](#onto_review_read)) — `onto_review_advance` only |
| `halted` | `reason: string` |

### `onto_review_cancel`

| Field | Type | Required |
|---|---|---|
| `sessionRoot` | `string` | ✓ |
| `projectRoot` | `string` | |
| `reason` | `string` | |

**Output** — `sessionId`, `sessionRoot`, `decision`
(`"requested"` \| `"not_cancellable"` \| `"already_terminal"`), `status`,
`cancelRequestPath`, `reason`, `artifactRefs`, and optional `runControl` /
`llmPresentation`. The runner writes the halted cancellation result at the next
runtime cancellation checkpoint.

### `onto_review_read`

One read surface for liveness while running and the bounded result once
complete.

| Field | Type | Required | Notes |
|---|---|---|---|
| `sessionRoot` | `string` | ✓* | *or* `latest: true` |
| `latest` | `boolean` | ✓* | recover the newest matching session under `projectRoot` |
| `projectRoot` | `string` | | |
| `target` | `string` | | `latest` filter |
| `domain` | `string` | | `latest` filter (canonical domain) |
| `requestHash` | `string` | | `latest` filter; the value a run handle returns |
| `createdAfter` | `string` | | `latest` filter, ISO lower bound |
| `limit` | `integer 1–20` | | max `latest` matches; defaults to 5 |
| `projectionLevel` | `"compact"` \| `"standard"` \| `"full"` | | defaults to `standard` |

Passing neither `sessionRoot` nor `latest: true` is rejected.

**Routing** — the result projection is returned only when the session has a
readable `ReviewRecord` (`completed` or `completed_with_degradation`) *and*
`projectionLevel` is not `compact`. Every other state (`prepared`, `running`,
`halted_partial`, `failed`, `unknown`) returns the status projection, so polling
never errors on a terminal-but-record-less session.

**Status projection**

| Field | `compact` | `standard` | `full` |
|---|---|---|---|
| `projectionLevel`, `sessionId`, `sessionRoot`, `status` | ✓ | ✓ | ✓ |
| `artifactRefs`, `failureRefs`, `structuredFailures` | ✓ | ✓ | ✓ |
| `routeVisibility`, `runControl`, `targetMaterialSupport`, `environmentWarnings`, `unitProgress`, `latestSessionMatches` | ✓ | ✓ | ✓ |
| `pipelineExecutionLedger` | — | trimmed to `{unitId, unitKind, status, trustStatus}` per unit | full ledger |
| `continuationPlan` | — | `{eligible, ineligibleReason, frontierUnits[], downstreamUnits[]}` (unit ids only) | full plan |
| `llmPresentation` | — | — | ✓ |

A `latest` lookup with no match returns
`{ sessionId: null, sessionRoot: null, status: "unknown", artifactRefs: {}, failureRefs: [], structuredFailures: [], latestSessionMatches: [] }`.

**Result projection** (`standard` / `full`)

| Field | Type | Notes |
|---|---|---|
| `sessionId`, `sessionRoot`, `projectionLevel` | `string` | |
| `reviewRecordSummary` | `{ reviewRecordId, recordStatus, requestText, resolvedLensIds[], participatingLensIds[], degradedLensIds[], deliberationStatus }` | `requestText` is truncated below `full` |
| `reviewRecord` | full `ReviewRecord` | `full` only |
| `finalOutputText` | `string` | `full` only |
| `finalOutputPath`, `reviewRunManifestPath` | `string` | |
| `artifactRefs` | `Record<string, string>` | |
| `pipelineExecutionLedger` | trimmed at `standard`, full at `full` | |
| `resultClassificationSummary` | compact at `standard`, full at `full` | |
| `failureRefs` | `string[]` | |
| `routeVisibility`, `llmPresentation`, `targetMaterialSupport`, `environmentWarnings` | | `environmentWarnings` are capped and truncated below `full` |

### `onto_list`

| Field | Type | Required |
|---|---|---|
| `kind` | `"lenses"` \| `"domains"` \| `"source_profiles"` | ✓ |
| `projectRoot` | `string` | |

**Output** — the one tool with a declared MCP `outputSchema`:

| `kind` | Payload |
|---|---|
| `lenses` | `{ full: string[], coreAxis: string[] }` |
| `domains` | `{ domains: string[] }` |
| `source_profiles` | `{ sourceProfiles: Array<{ profile_id, target_material_kind, is_default_for_kind, definition_ref, definition_sha256, contract_status, runtime_implementation_status, schema_version, profile_version, migration_status, supersedes[], replaced_by[], split_from[], split_into[], merged_from[], merged_into[], profile_path, title, support_summary, scan_targets[] }> }` |

### `onto_observe_source`

| Field | Type | Required | Notes |
|---|---|---|---|
| `targetRefs` | `string[]` (min 1) | ✓ | refs to classify and observe structurally |
| `projectRoot` | `string` | | |
| `sessionRoot` | `string` | | must stay inside `{projectRoot}/.onto/reconstruct` |
| `profilesRoot` | `string` | | source profile root; normally omitted |
| `filesystemAllowedRoots` | `string[]` | | roots for observation boundary reporting |

**Output** — `sessionId`, `sessionRoot`, `profilesRoot`, `artifactRefs`
(the reconstruct artifact-ref map plus `reconstruct_record`), and
`reconstructRecord` (the record artifact). No ontology meaning is generated.

### `onto_validate_reconstruct_directive`

The advertised schema is a flat object requiring `directiveKind` and
`sourceObservationsPath`; the runtime validates a discriminated union, so the
per-kind requirements below are enforced at the handler.

| Field | Required for |
|---|---|
| `directiveKind` | always — `"source_observation"` \| `"candidate_disposition"` \| `"ontology_seed"` |
| `sourceObservationsPath` | always |
| `directivePath` | `source_observation` |
| `candidateInventoryPath` | `candidate_disposition` |
| `candidateDispositionPath` | `candidate_disposition`, `ontology_seed` |
| `ontologySeedPath` | `ontology_seed` |
| `registryPath` | optional (`candidate_disposition`, `ontology_seed`) — registry-backed validators |
| `outputPath` | optional — where to write the validation artifact |
| `projectRoot` | optional |

**Output** — the validation artifact for that kind. All three share
`schema_version: "1"`, `session_id`, `created_at`, `validation_status`
(`"valid"` \| `"invalid"`), `validation_results: string[]`, and
`violations[]` (`{ code, message, subject_id, observation_id }`), plus:

| `directiveKind` | Additional fields |
|---|---|
| `source_observation` | `directive_ref`, `source_observations_ref`, `selected_observation_count` |
| `candidate_disposition` | `candidate_inventory_ref`, `candidate_disposition_ref`, `source_observations_ref`, `registry_ref`, `candidate_count`, `disposition_count`, `promoted_candidate_count`, `asserted_obligation_ids[]` |
| `ontology_seed` | `ontology_seed_ref`, `candidate_disposition_ref`, `source_observations_ref`, `registry_ref`, `seed_ref_count`, `evidence_ref_count`, `limitation_count`, `asserted_obligation_ids[]` |

Validation never repairs or rewrites the authored artifact.

### `onto_reconstruct`

Everything `onto_observe_source` accepts, plus:

| Field | Type | Required | Notes |
|---|---|---|---|
| `intent` | `string` | ✓ | declared reconstruction purpose, passed to the directive author |
| `domain` | `string` matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` | | domain whose `competency_qs.md` enters the governing snapshot |
| `resumeMode` | `"fresh"` \| `"reuse_existing_authored_artifacts"` | | `fresh` rejects same-session duplicate starts; reuse admits a resume only when authored-artifact provenance proves a current match |
| `semanticAuthorRealization` | `"direct_call"` | | defaults to `direct_call` |
| `confirmationProviderRealization` | `"direct_call"` | | defaults to `direct_call` |
| `judgeLlmEffort` | `string` | | run the answer-support judge at a different effort (live only) |
| `judgeModel` | `string` | | swap the judge model on the author's provider; an unsupported id degrades to the author model (INV-MODEL-1) and is recorded as a status note |
| `llmOverride` | `object` | | applies to `semantic_author`, `confirmation_provider`, `semantic_map_synthesize`, `dispatch_fallback` — the judge keeps its own knobs |

**Output** — a completed/graceful run:

| Field | Type | Notes |
|---|---|---|
| `sessionId`, `sessionRoot` | `string` | |
| `status` | `"completed"` \| `"limited"` \| `"blocked"` | `limited`/`blocked` = graceful terminal with an honest assembled output |
| `finalOutputPath`, `finalOutputText` | `string` | |
| `reconstructRecordPath`, `reconstructRunManifestPath` | `string` | |
| `artifactRefs` | artifact-ref map + `reconstruct_record` | |
| `reconstructRecord`, `reconstructRunManifest` | artifacts | |
| `metrics`, `stopDecision` | artifacts | present only on `completed` |

A trusted provider output-ceiling terminal instead returns the record-less
failed projection: `sessionId`, `sessionRoot`, `status: "failed"`,
`artifactRefs` (partial), `claimProjection: null`,
`claimProjectionValidation: null`, `progress`, `reconstructRecord: null`,
`runControlRef`, `runControlValidationRef`, `failure` (dispatch-failure summary
with token accounting and `failure_artifact_ref`), `reusableArtifactRefs[]`.

### `onto_reconstruct_read`

| Field | Type | Required | Notes |
|---|---|---|---|
| `sessionRoot` | `string` | ✓ | no `latest` recovery on this path |
| `projectRoot` | `string` | | |
| `projectionLevel` | `"compact"` \| `"standard"` \| `"full"` | | defaults to `standard` |

**Output** — `compact`/`standard` return the session status; `full` returns the
same object plus `finalOutputPath`, `finalOutputText`,
`reconstructRunManifestPath`, `reconstructRunManifest` (each `null` when not
produced).

| Field | Type | Notes |
|---|---|---|
| `sessionId`, `sessionRoot` | `string` | |
| `status` | terminal status | the record's `record_stage`, or `blocked`/`limited` on a graceful terminal, or `failed` |
| `artifactRefs` | artifact-ref map | |
| `claimProjection`, `claimProjectionValidation` | artifacts \| `null` | |
| `progress` | `{ executionProfile, currentStageId, stageCount, liveness{state, recommendedPollIntervalMs}, countSummary{…}, answerabilitySummary{…} \| null, stages[] }` | `countSummary` carries observation/claim/question/assessment/failure counts and `passRate`; `stages[]` entries are `{ stageId, state, owner, artifactRefs[], reason, authorityImpact }` |
| `pipelineExecutionLedger` | ledger | optional |
| `reconstructRecord` | record artifact \| `null` | `null` on the failed projection |

A trusted provider failure before record assembly returns the bounded
record-less failed projection at every projection level.

### Per-call LLM override (`llmOverride`)

`onto_review`, `onto_prepare_review` and `onto_reconstruct` accept an optional
`llmOverride` that overlays the settings-resolved LLM **for that one call only**
(settings unchanged, default-off — omitting it is byte-identical).

| Field | Type | Notes |
|---|---|---|
| `provider` | `"openai"` \| `"anthropic"` \| `"grok"` \| `"lmstudio"` | requires `model` |
| `auth` | `"api_key"` \| `"oauth"` \| `"local"` | omit ⇒ the provider's subscription worker route |
| `model` | `string` | |
| `effort` | `string` | |
| `service_tier` | `string` | |

Transport fields (`base_url`, `api_key_env`, `timeout_ms`) are deliberately
excluded and stay settings-owned, so a per-call override cannot select an
arbitrary endpoint or credential; passing one is rejected. The overlay reaches
only seats that carry their own settings `llm` block — an override that reaches
**zero** seats fails loud rather than silently running on the default route.
Metered billing is never chosen by default: it happens only when the seat states
`auth: api_key` or names an `api_key_env`.

Supported model ids are authored in
[`.onto/authority/supported-models.yaml`](https://github.com/kangminlee-maker/onto-mcp/blob/main/.onto/authority/supported-models.yaml).
`effort` is not validated at the tool boundary — it is checked at dispatch
against the provider-keyed accepted set in
[`src/core-runtime/llm/sealed-dispatch-capability.ts`](https://github.com/kangminlee-maker/onto-mcp/blob/main/src/core-runtime/llm/sealed-dispatch-capability.ts).
This gate is what makes a bad effort fail loud on the Claude Code
worker route, which otherwise warns and silently falls back to its default.

```json
{
  "name": "onto_review",
  "arguments": {
    "target": "src/example.ts",
    "intent": "Second-opinion review with a stronger model.",
    "llmOverride": { "model": "gpt-5.6-sol", "effort": "high" }
  }
}
```

### Shared output objects

| Object | Shape |
|---|---|
| `llmPresentation` | `{ openingBrief?, progress?, halt?, finalResult? }`, each `{ prompt: string, input: unknown }` — presentation guidance for the host LLM, not operating instructions |
| `artifactRefs` | `Record<string, string>` of artifact key → session path |
| `runHandle` | `{ schemaVersion: "1", sessionId, sessionRoot, invocationId, status, projectRoot, target{requestedTarget, targetScopeKind, targetMaterialKind}, domain{requestedToken, normalizedDomain, resolution, suggestionIds[]}, artifactRefs{sessionMetadata, executionPlan, reviewRunManifest, executionResult, finalOutput, reviewRecord}, requestHash, pollAfterSeconds }` |
| `runControl` | `{ activeAttempt \| null, lifecycleState, alreadyRunning, cancellationAvailable, cancellationRequested, cancellationRequestRef, continuationAvailable, retryAvailable, retrySemantics: "use_review_continue", hostTimeoutSemantics: "review_continues_under_session", statusReason }` |
| `activeAttempt` | `{ attemptId, attemptKind, status, sessionId, sessionRoot, startedAt, updatedAt, activeUnits[], requestedFrontierUnits[], latestObservedArtifactRef, staleAfterSeconds, secondsSinceUpdated, isStale, attemptManifestRef }` |
| `unitProgress[]` | `{ unitId, publicAlias, unitKind, progressStepId, status, packetPath, outputPath, runningLogRef, latestSignal, latestSignalAt, secondsSinceLatestSignal, attemptCount, failureMessage }` |
| `routeVisibility` | `{ schemaVersion: "1", source, sessionId, sessionRoot, executionRoute, executionAdapter, modelProvider, modelId, baseUrl, wireFormat, billingMode, authMode, actualHostRuntimes[], routeConsistency, actorRoute{…}, actorProfiles[…], … }` plus legacy compatibility projections (`executionRealization`, `hostRuntime`, `workerExecutor`, `runtimeProvider`) |
| `targetMaterialSupport` | `{ targetMaterialKind, supportStatus, unsupportedReason, detectionConfidence, detectionConfidenceBasis }` |
| `environmentWarnings[]` | `{ warningId, source, message, fatality: "non_fatal", affectedCapability, outputTrustImpact, observedAt }` |
| `structuredFailures[]` | the full structured failure records (`schema_version`, `failure_id`, `created_at`, `phase`, `reason_code`, `human_message`, `required_user_action`, `retry_safety`, `artifact_trust`, `dispatch_state`, `artifact_refs`, `mcp_error_code`, `details_kind`, `details`) or the bounded projection above |
| `latestSessionMatches[]` | `{ sessionId, sessionRoot, createdAt, requestedTarget, requestedDomainToken, normalizedDomain, requestHash, status, artifactRefs }` |
| `promptExecutionResult` | `{ session_root, executed_lens_count, synthesis_output_path, participating_lens_ids[], degraded_lens_ids[], synthesis_executed, error_log_path, halt_reason?, halt_phase?, halt_unit_id?, halt_unit_kind?, halt_lens_id? }` |
| `resultClassificationSummary` (compact) | `{ highest_severity, finding_count, issue_count, severity_counts, material_issue_count, non_material_finding_count, action_candidate_count, material_issue_signals[], non_material_finding_signals[] }`; signals are `{ issue_id, severity, material, signal, action_candidate_count }` |
| `resultClassificationSummary` (full) | adds `finding_severity_counts`, `issue_severity_counts`, and the full `material_issues[]`, `non_material_findings[]`, `action_candidates[]` |
| `pipelineExecutionLedger` (compact) | `{ schemaVersion?, pipeline?, sessionId?, unitCount, units[{unitId, unitKind, status, trustStatus}] }` |

### Status vocabularies

| Vocabulary | Values |
|---|---|
| review session status | `prepared`, `running`, `completed`, `completed_with_degradation`, `halted_partial`, `failed`, `unknown` |
| review run return status | `running`, `completed`, `completed_with_degradation`, `halted_partial` |
| `ReviewRecord.record_status` | `completed`, `completed_with_degradation`, `halted_partial` |
| deliberation status | `performed`, `not_performed` |
| finding severity | `blocker`, `high`, `medium`, `low`, `info` |
| reconstruct run status | `completed`, `limited`, `blocked`, or `failed` (record-less projection) |
| reconstruct terminal status (read path) | the record stage — `incomplete`, `preparation_artifacts_written`, `source_observation_directive_validated`, `candidate_disposition_validated`, `ontology_seed_validated`, `claim_realization_validated`, `seed_confirmed`, `seed_confirmation_validated`, `competency_questions_written`, `competency_questions_validated`, `competency_question_assessment_validated`, `failure_classification_validated`, `revision_proposal_validated`, `metrics_computed`, `stop_decision_written`, `pre_handoff_run_manifest_validated`, `handoff_decision_validated`, `completed` — or `blocked` / `limited` / `failed` |
| target material kind | `code`, `spreadsheet`, `document`, `database`, `mixed`, `unknown` |

### Protocol surface

| Aspect | Contract |
|---|---|
| protocol versions | `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`; negotiation echoes a supported requested version, otherwise returns the latest |
| additive fields | tool `annotations` are emitted only to clients that negotiated ≥ `2025-03-26`; `outputSchema` only ≥ `2025-06-18` — older clients get byte-identical pre-2025 tool definitions |
| annotations | every advertised tool declares `title`, `readOnlyHint`, `destructiveHint: false`, `openWorldHint` (`true` for the tools that dispatch to external LLM providers) |
| progress | when the host passes `_meta.progressToken`, `onto_review` emits `notifications/progress` with `{ progressToken, progress, total, message, _meta.ontoReviewProgress }`; the onto event carries `presentation_contract_version`, `event_kind: "mcp_progress"`, `sequence`, `generated_at`, `source`, `stage`, `session_root`, `message`, `progress{current, total, exact_step?, exact_total?, label?}` |
| tool profile | `ONTO_MCP_PROFILE=simple` advertises the chat-host subset (hides `onto_prepare_review`, `onto_review_continue`, `onto_review_round`, `onto_review_advance`); default is `full` |
| deprecated aliases | `onto_review_status`, `onto_review_result`, `onto_reconstruct_status`, `onto_reconstruct_result`, `onto_list_lenses`, `onto_list_domains`, `onto_list_source_profiles` stay callable with unchanged behavior but are not advertised in `tools/list`; they are removed only at a major tool-surface version bump |

## Configuration

Runtime settings live in `settings.json` (JSON shape; `#` comments accepted):

| Path | Role |
|---|---|
| `{project}/.onto/settings.json` | project-local settings |
| `~/.onto/settings.json` | user defaults |

Project settings override user defaults for scalar keys. In
`settings.json/v3`, actor `llm` blocks are complete model settings; they do not
inherit from a root `llm.default`.

Minimal Codex OAuth profile:

```jsonc
{
  # v3 puts model settings inside each actor.
  "schema_version": "settings.json/v3",
  "review": {
    "mode": "full",
    "execution": {
      "executor": "auto",
      "topology": "main-workers",
      "actors": {
        "teamlead": {
          "seat": "main",
          "llm": {
            "auth": "oauth",
            "provider": "openai",
            "model": "gpt-5.5",
            "effort": "medium",
            "service_tier": "fast"
          }
        },
        "lens": {
          "seat": "worker",
          "llm": {
            "auth": "oauth",
            "provider": "openai",
            "model": "gpt-5.5",
            "effort": "medium",
            "service_tier": "fast"
          }
        },
        "synthesize": {
          "seat": "worker",
          "llm": {
            "auth": "oauth",
            "provider": "openai",
            "model": "gpt-5.5",
            "effort": "xhigh",
            "service_tier": "fast"
          }
        }
      },
      "deliberation": "controlled-lens-deliberation"
    }
  },
  "reconstruct": {
    "execution": {
      "actors": {
        "semantic_author": {
          "llm": {
            "auth": "oauth",
            "provider": "openai",
            "model": "gpt-5.5",
            "effort": "high",
            "service_tier": "fast"
          }
        },
        "confirmation_provider": {
          "llm": {
            "auth": "oauth",
            "provider": "openai",
            "model": "gpt-5.5",
            "effort": "medium",
            "service_tier": "fast"
          }
        }
      }
    }
  }
}
```

LLM switcher axes:

| auth | provider | Runtime path |
|---|---|---|
| `oauth` | `openai` | Codex worker (subscription) |
| `oauth` | `anthropic` | Claude Code worker (subscription) |
| `api_key` | `openai` | OpenAI API |
| `api_key` | `anthropic` | Anthropic API |
| `api_key` | `grok` | xAI/Grok OpenAI-style API |
| `local` | `lmstudio` | LM Studio OpenAI-style endpoint |

Unsupported settings stop during profile resolution.

### provider·model 전환 (권장: `onto configure-provider`)

`settings.json`을 손으로 고치는 대신 `onto configure-provider`가 actor LLM 블록을
라우트 검증 후 기록합니다(units 등 다른 설정은 보존). 라우팅 불가능한 조합은 기록
전에 fail-loud 합니다.

```sh
# Codex (OpenAI) OAuth
onto configure-provider --provider openai --model gpt-5.5 --auth oauth \
  --effort medium --service-tier fast

# Claude Code (Anthropic) OAuth
onto configure-provider --provider anthropic --model claude-opus-4-8 --auth oauth \
  --effort high
```

- `--service-tier`는 `openai`+`oauth`(Codex) 경로 전용입니다 — anthropic에 주면
  profile 해석 단계에서 거부됩니다.
- `--auth`를 주면 reconstruct actor 블록(`semantic_author`/`confirmation_provider`)도
  함께 기록합니다. 생략하면 review actor만 기록하고 loader가 provider 기본 auth를 파생합니다.
- `--timeout-ms <ms>`는 각 actor `llm` 블록에 per-actor `timeout_ms`(양의 정수)를
  함께 기록합니다 — codex/claude direct-call worker 호출 타임아웃(아래 [타임아웃](#타임아웃)
  참고). api_key SDK 경로에는 적용되지 않습니다.
- `--project`는 프로젝트 seat(`.onto/settings.json`)에, 생략하면 사용자 seat
  (`~/.onto/settings.json`)에 기록합니다.
- 지원 model id는 [`.onto/authority/supported-models.yaml`](.onto/authority/supported-models.yaml)가
  authority입니다. 범용 seat은 `gpt-5.5`(openai)·`claude-opus-4-8`(anthropic)이고,
  역할 전용으로 `review`에 `gpt-5.6-sol`·`claude-fable-5`, `semantic_map_synthesize`에
  `gpt-5.6-luna`·`claude-sonnet-5`가 인증돼 있습니다. 현재 프로젝트에서 실제로
  해석되는 seat은 `onto seats`로 확인하세요.
- 이 명령은 actor 블록만 기록합니다. `units[].llm.model`로 unit별 model을 고정해
  두었다면(위 정적 프로필 예시가 그렇습니다) 같은 model로 바꾸거나 그 `model` 키를
  지워 actor 값을 상속하게 하세요.

### 타임아웃

| 경로 | 기본값 | 조절 knob (우선순위) |
|---|---|---|
| review unit worker (codex/claude) | 240s (짧은 응답 단계 180s, `issue_stance_matrix` 120s) | `units[].timeout_ms` |
| direct-call CLI worker (codex/claude) — reconstruct·inline review | 600s | actor `llm.timeout_ms` → 없으면 `ONTO_LLM_TIMEOUT_MS` |
| SDK direct call (`api_key`) | 120s | `ONTO_LLM_TIMEOUT_MS` (ms) |

`llm.timeout_ms`(ms)는 actor `llm` 블록에 넣는 per-actor 값으로, codex/claude CLI worker
경로(reconstruct의 `semantic_author`/`confirmation_provider`, inline review actor)의 호출
타임아웃을 그 값으로 고정합니다. 없으면 env `ONTO_LLM_TIMEOUT_MS`, 그것도 없으면 기본값을
씁니다(api_key SDK 경로에는 적용되지 않고 `ONTO_LLM_TIMEOUT_MS`만 반영). 이 knob은 review의
`units[].timeout_ms`(worker 프로세스 bound)와 구분되는 별개 계층입니다.

`ONTO_LLM_TIMEOUT_MS`(ms)는 direct-call/CLI-worker와 SDK 경로 기본값을 전역으로 덮어씁니다.
opus 같은 프론티어 모델의 긴 단일-turn authoring도 600s worker 기본값으로 완료되므로 지원
모델에는 override가 필요 없습니다. 특정 review unit이 오래 걸리면 그 unit의
`units[].timeout_ms`만 키우면 됩니다(모든 unit에 큰 값을 박을 필요 없음).

## Documentation

| Document | Contents |
|---|---|
| [reconstruct contract registry](https://github.com/kangminlee-maker/onto-mcp/blob/main/.onto/processes/reconstruct/reconstruct-contract-registry.yaml) | active reconstruct artifact/gate authority graph (prose contracts alongside) |
| [docs/development.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/development.md) | verification harnesses and development workflow |
| [docs/architecture/repo-layout.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/architecture/repo-layout.md) | repository layout SSOT: folder roles and placement rules |
| [docs/architecture/](https://github.com/kangminlee-maker/onto-mcp/tree/main/docs/architecture) | architecture notes |
