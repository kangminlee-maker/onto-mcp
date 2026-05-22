# Onto MCP

`onto-mcp` is the TypeScript product core for ontology-as-code review. The
public interface is MCP-native; repository-local npm scripts remain development
harnesses for verification and debugging.

```text
.onto contracts and domain documents
        -> TS review runtime
        -> core API facade
        -> MCP tools
        -> provider adapters
```

## Current Product Slice

The active implementation target is `review`.

`review` performs:

1. invocation interpretation and binding
2. execution preparation artifacts
3. isolated parallel lens execution
4. issue ledger and issue stance closure artifacts
5. controlled lens deliberation
6. conservative synthesis
7. `ReviewRecord` assembly
8. concise human-readable final output

`learn`, `govern`, `reconstruct`, and `evolve` remain separate design slices.
They should be added to MCP after review is stable.

## Public Interface

Start the MCP server:

```bash
onto mcp
```

Available MCP tools:

| Tool | Purpose |
|---|---|
| `onto.review` | Run the full review path and return artifact refs plus summary |
| `onto.prepare_review` | Prepare a review session and prompt packets |
| `onto.review_status` | Read structured status and artifact refs |
| `onto.review_result` | Read `review-record.yaml` and final output |
| `onto.list_lenses` | List canonical lens sets |
| `onto.list_domains` | List available domain ids |

MCP results include `llmPresentation` prompts. The runtime supplies bounded
facts; the host LLM should use those prompts to explain the opening brief and
final result to the user without inventing settings or findings.

Repository-local development harness:

```bash
npm run review:invoke -- <target> "<intent>"
```

`review:invoke` prints a structured start preview before execution begins:

- review target and filesystem boundary
- request intent
- selected domain and selection mode
- review mode and lens ids
- execution mode, seats, deliberation mode, concurrency
- model auth/provider/model/effort/service tier
- settings locations and MCP/dev-harness override points

During execution, the runner prints numbered progress markers for the bounded
review stages. At completion, it prints a structured result overview:

- outcome status and deliberation status
- target/domain/review mode
- planned, participating, and degraded lens counts
- comprehensive `Final Review Result` explanation from synthesize
- issue count plus severity/timing/closure classification
- top problem definitions from `problem-framing.yaml`
- primary artifact paths

For MCP clients, prefer the `llmPresentation.openingBrief` and
`llmPresentation.finalResult` prompt/input pairs over CLI stdout when presenting
start and finish explanations.

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
      "deliberation": "controlled-lens-deliberation",
      "max_concurrent_workers": 9
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

## Repository Map

| Path | Role |
|---|---|
| `.onto/authority/` | canonical ontology data and runtime registries |
| `.onto/processes/review/` | review contracts |
| `.onto/domains/` | bundled domain documents |
| `src/core-runtime/` | TypeScript runtime |
| `src/core-api/` | library facade used by MCP |
| `src/mcp/` | MCP tool surface |
| `src/providers/` | provider-specific execution capability |
| `development-records/` | development records and archived material |
| `IMPLEMENTATION_MAP.html` | visual architecture and roadmap map |

## Verification

```bash
npm run check:ts-core
npm run build:ts-core
npm run test:mcp:review
npm run test:e2e
npm run lint:output-language-boundary
git diff --check
```
