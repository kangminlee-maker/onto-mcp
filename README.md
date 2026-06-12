# Onto MCP

[![npm version](https://img.shields.io/npm/v/onto-mcp)](https://www.npmjs.com/package/onto-mcp)

MCP-native ontology tools that help LLMs **review** implementation artifacts,
**derive an ontology** from real sources, and guide extensions — with runtime
validation gates owning every structured claim.

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
(`CLAUDE_CONFIG_DIR`). If you run multiple profiles, target one explicitly:

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
| `onto_review_status` | Read structured status and artifact refs |
| `onto_review_result` | Read bounded result projections; `compact`/`standard` use count-and-signal summaries, `full` includes `review-record.yaml` and final output |
| `onto_list_lenses` | List canonical lens sets |
| `onto_list_domains` | List available domain ids |
| `onto_list_source_profiles` | List reconstruct source profiles |
| `onto_observe_source` | Materialize reconstruct material profile, inventory, source observations, and initial record |
| `onto_validate_reconstruct_directive` | Validate LLM-authored reconstruct artifacts |
| `onto_reconstruct` | Run the material-aware direct-call reconstruct path with runtime validation gates |
| `onto_reconstruct_status` | Read reconstruct session status, progress, counts, and artifact refs |
| `onto_reconstruct_result` | Read `reconstruct-record.yaml`, run manifest, progress projection, and final output |

MCP results include `llmPresentation` prompts: the runtime supplies bounded
facts, and the host LLM uses those prompts to explain the opening brief and
final result without inventing settings or findings.

### Self-documentation

The server advertises MCP `resources` and `prompts` so a host LLM can learn
onto without external docs:

- **Resource `onto://usage`** — provider setup, the review and reconstruct
  workflows, the running-handle polling pattern, and output-size guidance.
- **Prompts** — canonical task templates `review_target` (args: `target`,
  `intent`, `reviewMode`) and `reconstruct_seed` (args: `targetRefs`,
  `intent`).

`onto_review_status` accepts `projectionLevel` (`compact` | `standard` |
`full`); use `compact` in token-limited hosts.

### Runtime watcher

When a review or reconstruct run starts, the runtime writes a session-local
`runtime-events.ndjson` stream and tries to open a live watcher in a supported
terminal (tmux, Warp, Cursor, iTerm2, Apple Terminal, Codex Desktop with a
configured launcher). Set `ONTO_RUNTIME_WATCHER=0` to disable, or
`ONTO_RUNTIME_WATCHER_COMMAND` with a `{watcherCommand}` template for
unsupported hosts.

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

## Documentation

| Document | Contents |
|---|---|
| [reconstruct contract registry](https://github.com/kangminlee-maker/onto-mcp/blob/main/.onto/processes/reconstruct/reconstruct-contract-registry.yaml) | active reconstruct artifact/gate authority graph (prose contracts alongside) |
| [docs/development.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/development.md) | verification harnesses and development workflow |
| [docs/architecture/repo-layout.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/architecture/repo-layout.md) | repository layout SSOT: folder roles and placement rules |
| [docs/architecture/](https://github.com/kangminlee-maker/onto-mcp/tree/main/docs/architecture) | architecture notes |
