# Onto MCP

`onto-mcp` is the TypeScript product core for ontology-as-code review. The
public interface is MCP-native; repository-local verification harnesses are
internal and are not product entrypoints.

```text
.onto contracts and domain documents
        -> TS review runtime
        -> core API facade
        -> MCP tools
        -> provider adapters
```

## Current Product Slice

The active implementation target is `review`.

Across `review`, `reconstruct`, and future `evolve`, targets are not assumed to
be code. Runtime contracts classify the material form with
`target_material_kind` (`code`, `spreadsheet`, `document`, `database`, `mixed`,
or `unknown`) before choosing observation, validation, or adapter behavior. The
cross-process goal contract lives at
`.onto/processes/shared/target-material-kind-contract.md`.

`review` performs:

1. invocation interpretation and binding
2. execution preparation artifacts
3. isolated parallel lens execution
4. issue ledger and issue stance closure artifacts
5. controlled lens deliberation
6. conservative synthesis
7. `ReviewRecord` assembly
8. concise human-readable final output

`reconstruct` is the next active productization slice. It has active contracts
under `.onto/processes/reconstruct/`, MCP/direct-call wiring, material-aware
runtime helpers, and a bounded integral runner. Code is the first partially
wired runtime profile. Spreadsheet, document, and database profiles are
contract-active but runtime-planned until their adapters are implemented; mixed
targets are partial-composite only. The current runner classifies target
material, expands supported directory targets into per-member source
observations, writes the initial source frontier, runs reconstruct lens
judgments and exploration synthesis through a configured LLM provider, validates
available evidence refs, computes deterministic metrics, and writes
`reconstruct-run-manifest.yaml`. It emits `final-output.md` and the primary
`reconstruct-record.yaml` only through the validated handoff path after
`handoff-decision-validation.yaml` and
`reconstruct-run-manifest.pre-handoff-validation.yaml` pass; otherwise terminal
projection must be blocked or limitation-backed. The final
`reconstruct-run-manifest.post-publication-validation.yaml` is a post-publication audit for the
complete manifest after final output and record refs exist. The
current public run path defaults to
`direct_call` semantic authoring and host-mediated confirmation. It fails loud
when provider/model/credentials, LLM-authored artifact shape, unsupported
material, or runtime gates are invalid. Optional reconstruct `domain` input
admits that domain's `competency_qs.md` into the run governing snapshot for
domain competency trace validation; there is no separate active
domain competency selection artifact.
`evolve` has a future material-kind adapter contract at
`.onto/processes/evolve/material-kind-adapter-contract.md`, but no active
runtime or MCP tool. `learn` and `govern` remain separate design slices.

## Public Interface

Install from npm:

```bash
npm install -g onto-mcp
```

Start the MCP server:

```bash
onto mcp
```

### Register with hosts

`npm install` only puts the `onto` binary on PATH — each MCP host (Claude Code,
Codex, Claude Desktop, Cursor) must additionally be told to launch it. `onto
register` does that in one step. The same global binary is shared by every host.

```bash
onto register                  # interactive: pick detected hosts (terminal only)
onto register --all --yes      # non-interactive: every detected host
onto register --hosts cursor,codex --yes
onto register --list           # show detection status, write nothing
onto register --hosts cursor --dry-run   # preview the change, write nothing
```

Mechanism per host:

| Host | How it is registered |
|---|---|
| Claude Code | `claude mcp add onto -s user -- onto mcp` (user scope = all projects) |
| Codex CLI | `codex mcp add onto -- onto mcp` |
| Claude Desktop | edits `mcpServers.onto` in `claude_desktop_config.json` |
| Cursor | edits `mcpServers.onto` in `~/.cursor/mcp.json` |

For the CLI-backed hosts, `onto register` prefers the official CLI and falls back
to printing manual instructions when it is not on PATH. It verifies the result
after `mcp add` and reports `failed` (not a false `registered`) if the CLI exits
successfully but the server is not listed afterward — e.g. when `claude` on PATH
is an alias/wrapper or points at the wrong profile. JSON edits preserve any
servers already present and are idempotent (re-running reports `skipped`).
Registration writes only host-owned config; it never writes onto runtime data.
Restart the host app after registering to pick up the new server. Override the
launched command or server name with `--command <cmd>` / `--name <id>`.

**Claude Code profiles.** Claude Code stores MCP servers per config directory
(`CLAUDE_CONFIG_DIR`). If you run multiple profiles (e.g. `~/.claude`,
`~/.claude-1`), target one explicitly so registration lands in the right place:

```bash
onto register --hosts claude-code --claude-config-dir ~/.claude-1 --yes
```

When `--claude-config-dir` is omitted, an ambient `CLAUDE_CONFIG_DIR` is honored
(shown in the plan), otherwise the claude default `~/.claude` is used.

For project-local installs, add `onto-mcp` to the project and run the local
binary:

```bash
npm install --save-dev onto-mcp
npm exec -- onto mcp
```

Available MCP tools:

| Tool | Purpose |
|---|---|
| `onto_review` | Run the full review path and return artifact refs plus summary |
| `onto_prepare_review` | Prepare a review session and prompt packets |
| `onto_review_continue` | Continue a prepared or halted review from the ledger frontier |
| `onto_review_status` | Read structured status and artifact refs |
| `onto_review_result` | Read `review-record.yaml` and final output |
| `onto_list_lenses` | List canonical lens sets |
| `onto_list_domains` | List available domain ids |
| `onto_list_source_profiles` | List reconstruct source profiles |
| `onto_observe_source` | Materialize reconstruct material profile, inventory, source observations, and initial record |
| `onto_validate_reconstruct_directive` | Validate LLM-authored reconstruct artifacts |
| `onto_reconstruct` | Run the material-aware direct-call reconstruct path with runtime validation gates |
| `onto_reconstruct_status` | Read reconstruct session status, progress, counts, and artifact refs |
| `onto_reconstruct_result` | Read `reconstruct-record.yaml`, run manifest, progress projection, and final output |

MCP results include `llmPresentation` prompts. The runtime supplies bounded
facts; the host LLM should use those prompts to explain the opening brief and
final result to the user without inventing settings or findings.

### Self-documentation (resources and prompts)

The server advertises MCP `resources` and `prompts` so a host LLM can learn onto
without external docs:

- **Resource `onto://usage`** — a usage guide covering provider setup, the review
  and reconstruct workflows, the running-handle polling pattern, and output-size
  guidance. Discover with `resources/list`, read with `resources/read`.
- **Prompts** (`prompts/list` / `prompts/get`) — canonical task templates
  `review_target` (args: `target`, `intent`, `reviewMode`) and `reconstruct_seed`
  (args: `targetRefs`, `intent`) that expand into ready-to-run instructions.

`onto_review_status` accepts `projectionLevel` (`compact` | `standard` | `full`,
default `full`); use `compact` in token-limited hosts since the full status can be
large.

When `onto_review`, `onto_review_continue`, or `onto_reconstruct` starts, the
runtime writes a session-local `runtime-events.ndjson` stream and tries to open
`scripts/onto-runtime-watch.sh` in a supported terminal split/tab. Current
automatic attach targets are `tmux`, Codex Desktop with a configured launcher
path, Warp, Cursor, iTerm2, and Apple Terminal. Codex Desktop attach never uses
UI keystroke automation by default; set
`ONTO_RUNTIME_WATCHER_CODEX_APP_LAUNCHER=/absolute/path/to/launcher.sh` to
enable it. The launcher receives `watcherScript`, `sessionRoot`, `projectRoot`,
and `watcherCommand` as positional arguments. Unsupported hosts can set
`ONTO_RUNTIME_WATCHER_COMMAND` with a launcher template containing
`{watcherCommand}`. Each stream line is source-tagged by pipeline,
unit/stage/process, and stdout/stderr/status. Set `ONTO_RUNTIME_WATCHER=0` to
disable the automatic terminal attach.

Minimal reconstruct MCP call shape:

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

`semanticAuthorRealization` and `confirmationProviderRealization` default to
`direct_call`. Configure `.onto/settings.json` or user `~/.onto/settings.json`
with an `llm` provider/model before running. Test-only mock helpers are not
product completion evidence.

For MCP clients, prefer the `llmPresentation.openingBrief` and
`llmPresentation.finalResult` prompt/input pairs when presenting start and
finish explanations.

Runtime hardening is available as a development verification harness:

```bash
npm run test:review:hardening
```

It runs large and repeated mock reviews, validates primary artifact consistency,
checks `Tools: required` native-tool boundaries, verifies provider preflight
fail-loud behavior, and removes temporary fixtures unless
`ONTO_REVIEW_HARDENING_KEEP_TMP=1` is set.

## Settings

Runtime settings live in JSON:

| Path | Role |
|---|---|
| `{project}/.onto/settings.json` | project-local settings |
| `~/.onto/settings.json` | user defaults |

Project settings override user defaults for scalar keys.

Minimal Codex OAuth profile:

```json
{
  "llm": {
    "auth": "oauth",
    "provider": "openai",
    "model": "gpt-5.5",
    "effort": "medium",
    "service_tier": "fast"
  },
  "review": {
    "execution": {
      "mode": "main-workers",
      "teamlead": {
        "seat": "main",
        "llm": "inherit"
      },
      "lens": {
        "seat": "worker",
        "llm": "inherit"
      },
      "synthesize": {
        "seat": "worker",
        "llm": {
          "effort": "xhigh"
        }
      },
      "deliberation": "controlled-lens-deliberation"
    }
  },
  "review_mode": "full"
}
```

LLM switcher axes:

| auth | provider | Runtime path |
|---|---|---|
| `oauth` | `openai` | Codex worker |
| `api_key` | `openai` | OpenAI API |
| `api_key` | `anthropic` | Anthropic API |
| `api_key` | `grok` | xAI/Grok OpenAI-style API |
| `local` | `lmstudio` | LM Studio OpenAI-style endpoint |

Unsupported settings stop during profile resolution.

## Review Artifacts

A review session writes artifacts under `.onto/review/<session-id>/`.

Primary outputs:

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

## Reconstruct Artifacts

A reconstruct session writes artifacts under `.onto/reconstruct/<session-id>/`.

Target runtime-gated outputs below are a non-authoritative quick map. The active
artifact and gate catalog authority is
`.onto/processes/reconstruct/reconstruct-contract-registry.yaml`.

| Artifact | Owner | Purpose |
|---|---|---|
| `target-material-profile.yaml` | runtime | detected `target_material_kind`, support status, and selected source profiles |
| `target-material-profile-validation.yaml` | runtime | material profile gate status and selected-profile closure |
| `source-inventory.yaml` | runtime | material-specific inventory units and scan boundary |
| `source-observations.yaml` | runtime | structural observations with stable evidence ids and source content fingerprints |
| `source-observation-directive.yaml` | host LLM author | selected observations for evidence use |
| `source-observation-directive-validation.yaml` | runtime | validation of selected observation refs |
| `*.reuse-provenance.yaml` | runtime | sidecar proof that same-session resume reuses authored YAML only when invocation, source, governing snapshot, and artifact hash match |
| `rounds/<round-id>/lens-judgments/*.yaml` | host LLM author | reconstruct lens judgments over trusted observations |
| `rounds/<round-id>/exploration-synthesis.yaml` | host LLM author | integrated gaps and next-source needs |
| `rounds/<round-id>/source-frontier.yaml` | host LLM author | requested next source refs or no-next-frontier rationale |
| `rounds/<round-id>/source-frontier-validation.yaml` | runtime | frontier validation plus explicit dependency proof on `target-material-profile-validation.yaml` |
| `candidate-inventory.yaml` | host LLM author | salient object, actor, action, workflow, permission, data source, constraint, and concept candidates |
| `candidate-disposition.yaml` | host LLM author | one disposition for every salient candidate, including planned target seed refs for promoted candidates |
| `candidate-disposition-validation.yaml` | runtime | inventory/disposition closure and projection validation |
| `ontology-seed.yaml` | host LLM author | primary ontology seed for maturation iteration |
| `ontology-seed-validation.yaml` | runtime | seed layer, id, binding, disposition, and evidence-ref validation |
| `claim-realization-map.yaml` | host LLM author | one realization stance for every ontology seed claim |
| `claim-realization-map-validation.yaml` | runtime | seed-claim closure and realization evidence validation |
| `competency-questions.yaml` | host LLM author | questions linked to the declared purpose, seed layers, registry facets, proof-contract refs, admitted domain competency ids, and diagnostic/claim-based dispositions |
| `competency-questions-validation.yaml` | runtime | question id, derived evidence scope, seed-link, evidence, registry facet/proof refs, exactly-one admitted domain competency coverage, and run-manifest admitted domain trace validation |
| `competency-question-assessment.yaml` | host LLM author + runtime projections | answer status, required seed refs, evidence refs, and downstream effect for every authoritative CQ |
| `competency-question-assessment-validation.yaml` | runtime | exactly-once CQ assessment validation plus answer-status/downstream-effect and seed/evidence closure |
| `seed-confirmation.yaml` | host/user mediated | confirmation or limitation decision over validated seed claims before CQ authoring |
| `seed-confirmation-validation.yaml` | runtime | confirmation closure and CQ eligibility over the validated seed; terminal seed iteration readiness is owned by `handoff-decision-validation.yaml` |
| `failure-classification.yaml` | host LLM author | material failure and gap classification |
| `failure-classification-validation.yaml` | runtime | failure enum, linkage, and materiality validation |
| `revision-proposal.yaml` | host LLM author | bounded revision/deferral proposals |
| `revision-proposal-validation.yaml` | runtime | proposal id, target, action, and regression guard validation |
| `reconstruct-metrics.yaml` | runtime | deterministic counts, answerability bucket counts, unresolved/deferred counts, and pass rate |
| `stop-decision.yaml` | host LLM author | proposed stop/continue/ask-user decision; not the readiness authority |
| `handoff-decision-validation.yaml` | runtime | canonical seed iteration readiness projection from runtime gates plus `stop-decision.yaml` consistency before final output and record projection |
| `final-output.md` | host LLM author + runtime footer | user-facing result grounded in artifacts, seed validity, and maturation limitations |
| `reconstruct-run-manifest.yaml` | runtime | step refs, `performed_by` provenance, execution profile, requested domain ids, and purpose adequacy scope |
| `reconstruct-run-manifest.post-publication-validation.yaml` | runtime | post-publication registry hash, active contract hash, source profile migration, validator, reference-standard, pattern-catalog URI/snapshot, version, and migration snapshot consistency after final output and record refs exist |
| `reconstruct-record.yaml` | runtime | primary structured reconstruct artifact |

The runtime keeps full source evidence in `source-observations.yaml`. LLM
authoring calls may receive compact prompt projections, such as selected
observations with shortened text excerpts, while validation still checks all
generated evidence refs against the full artifact truth.
Terminal projection uses `handoff-decision-validation.yaml.readiness_projection`
as the seed iteration readiness authority and requires both validated handoff and a validated
pre-handoff run-manifest snapshot. The final
`reconstruct-run-manifest.post-publication-validation.yaml` is the post-publication audit for the
complete manifest after `final-output.md` and `reconstruct-record.yaml` refs are
known; it is not a prerequisite for the pre-handoff seed iteration readiness projection. The
same artifact records `gate_projection[]`, where each
active gate is evaluated through the registry `required_when_predicate_catalog`
before validation status is required.

Contract-planned conditional proof authorities are not emitted by the current
runtime until their validator surfaces are implemented:

| planned artifact | planned authority |
|---|---|
| `rounds/<round-id>/source-observation-delta.yaml` / `rounds/<round-id>/source-observation-delta-validation.yaml` | multi-round observation lineage before newly observed frontier evidence is used |
| `rounds/<round-id>/source-observation-reentry-validation.yaml` | post-use re-entry validation for frontier-triggered observations cited downstream |
| `query-proofs.yaml` / `query-proofs-validation.yaml` | executable query/API proof rows when queryability or implementation access is claimed |
| `visualization-proofs.yaml` / `visualization-proofs-validation.yaml` | visualization surface proof rows when static or overview visualization is claimed |
| `graph-exploration-proofs.yaml` / `graph-exploration-proofs-validation.yaml` | graph navigation/exploration proof rows when traversal or large-graph exploration is claimed |
| `required-when-evaluation.yaml` / `required-when-evaluation-validation.yaml` | standalone audited conditional-gate applicability trace; the current terminal handoff projection embeds predicate input/result details in `handoff-decision-validation.yaml.gate_projection[]` |
| `ontology-handoff mapping proof` | per-axis ontology handoff mapping gate once that validator is implemented |

The active seed target is defined by
`.onto/processes/reconstruct/operational-ontology-seed-contract.md`.
The full seeding and maturation plan is
`.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md`.
The active contract, source profile, lens judgment, artifact, gate, seed iteration readiness, and
projection authority registry is
`.onto/processes/reconstruct/reconstruct-contract-registry.yaml`.
The seed is valid only when process completion, seed validation, downstream
gates, and maturation limitations are reported separately and consistently.
The seed and later maturation loop judge actionability through three coverage
surfaces: `static_surface` for what exists and what evidence grounds it,
`kinetic_surface` for who can do what and what changes, and `dynamic_surface`
for conditions, permissions, states, exceptions, runtime context, external
dependencies, and unresolved decisions that change the answer.

## Repository Map

| Path | Role |
|---|---|
| `.onto/authority/` | canonical ontology data and runtime registries |
| `.onto/processes/shared/` | cross-process target and runtime contracts |
| `.onto/processes/review/` | review contracts |
| `.onto/processes/reconstruct/` | reconstruct contracts and source profiles |
| `.onto/domains/` | bundled domain documents |
| `src/core-runtime/` | TypeScript runtime |
| `src/core-api/` | library facade used by MCP |
| `src/mcp/` | MCP tool surface |
| `development-records/` | development records and archived material |
| `IMPLEMENTATION_MAP.html` | visual architecture and roadmap map |

## Verification

```bash
npm run check:ts-core
npm run build:ts-core
npm run test:mcp:review
npm run test:review:hardening
git diff --check
```
