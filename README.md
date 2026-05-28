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

`reconstruct` now has a current design contract under
`.onto/processes/reconstruct/`, material-aware runtime helpers, and a bounded
direct-call integral runner. The runner classifies target material, expands
directory targets into per-member source observations, writes the initial source
frontier, runs reconstruct lens judgments and exploration synthesis through a
configured LLM provider, validates evidence refs, computes deterministic metrics, and writes
`final-output.md`, `reconstruct-run-manifest.yaml`, and the primary
`reconstruct-record.yaml`. Code is the first fixture; the runner path is shared
with spreadsheet/document/database material through source profiles and
material-specific observers. The current public run path defaults to
`direct_call` semantic authoring and host-mediated confirmation. It fails loud
when provider/model/credentials, LLM-authored artifact shape, or runtime gates
are invalid; domain context selection remains deferred.
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

For project-local installs, add `onto-mcp` to the project and run the local
binary:

```bash
npm install --save-dev onto-mcp
npm exec -- onto mcp
```

Available MCP tools:

| Tool | Purpose |
|---|---|
| `onto.review` | Run the full review path and return artifact refs plus summary |
| `onto.prepare_review` | Prepare a review session and prompt packets |
| `onto.review_continue` | Continue a prepared or halted review from the ledger frontier |
| `onto.review_status` | Read structured status and artifact refs |
| `onto.review_result` | Read `review-record.yaml` and final output |
| `onto.list_lenses` | List canonical lens sets |
| `onto.list_domains` | List available domain ids |
| `onto.list_source_profiles` | List reconstruct source profiles |
| `onto.observe_source` | Materialize reconstruct material profile, inventory, source observations, and initial record |
| `onto.validate_reconstruct_directive` | Validate LLM-authored reconstruct directive files |
| `onto.reconstruct` | Run the material-aware direct-call reconstruct path with runtime validation gates |
| `onto.reconstruct_status` | Read reconstruct session status, progress, counts, and artifact refs |
| `onto.reconstruct_result` | Read `reconstruct-record.yaml`, run manifest, progress projection, and final output |

MCP results include `llmPresentation` prompts. The runtime supplies bounded
facts; the host LLM should use those prompts to explain the opening brief and
final result to the user without inventing settings or findings.

Minimal reconstruct MCP call shape:

```json
{
  "name": "onto.reconstruct",
  "arguments": {
    "projectRoot": "/path/to/project",
    "targetRefs": ["src/example.ts"],
    "intent": "Create a bounded reconstruct Seed from this target.",
    "sessionRoot": ".onto/reconstruct/example-run"
  }
}
```

`semanticAuthorRealization` and `confirmationProviderRealization` default to
`direct_call`. Configure `.onto/settings.json` or user `~/.onto/settings.json`
with an `llm` provider/model before running. Test-only mock helpers are not
product completion evidence.

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

Implemented direct-call, runtime-gated outputs:

| Artifact | Owner | Purpose |
|---|---|---|
| `target-material-profile.yaml` | runtime | detected `target_material_kind`, support status, and selected source profiles |
| `source-inventory.yaml` | runtime | material-specific inventory units and scan boundary |
| `initial-source-frontier.yaml` | runtime | first observation frontier derived from inventory |
| `source-observations.yaml` | runtime | structural observations with stable evidence ids |
| `source-observation-directive.yaml` | host LLM author | selected observations for evidence use |
| `source-observation-directive-validation.yaml` | runtime | validation of selected observation refs |
| `rounds/<round-id>/lens-judgments/*.yaml` | host LLM author | reconstruct lens judgments over trusted observations |
| `rounds/<round-id>/exploration-synthesis.yaml` | host LLM author | integrated gaps and next-source needs |
| `rounds/<round-id>/source-frontier.yaml` | host LLM author | requested next source refs or no-next-frontier rationale |
| `rounds/<round-id>/source-frontier-validation.yaml` | runtime | boundary, duplicate, and inventory validation for the frontier |
| `seed-candidate.yaml` | host LLM author | evidence-backed Seed candidate with separate `claim_id` and user-facing `name` |
| `seed-candidate-validation.yaml` | runtime | Seed claim name, shape, and evidence-ref validation |
| `claim-realization-map.yaml` | host LLM author | claim-level evidence stance |
| `claim-realization-map-validation.yaml` | runtime | claim id, stance enum, and evidence linkage validation |
| `seed-confirmation.yaml` | host/user mediated | accepted, rejected, partial, or deferred Seed confirmation |
| `seed-confirmation-validation.yaml` | runtime | confirmation transition validation and derived claim sets |
| `competency-questions.yaml` | host LLM author | questions linked to confirmed claims |
| `competency-questions-validation.yaml` | runtime | CQ id, eligible-claim coverage, claim-link, and evidence validation |
| `competency-question-assessment.yaml` | host LLM author | answer status for every authoritative CQ |
| `competency-question-assessment-validation.yaml` | runtime | exactly-once CQ assessment validation |
| `failure-classification.yaml` | host LLM author | material failure and gap classification |
| `failure-classification-validation.yaml` | runtime | failure enum, linkage, and materiality validation |
| `revision-proposal.yaml` | host LLM author | bounded revision/deferral proposals |
| `revision-proposal-validation.yaml` | runtime | proposal id, target, action, and regression guard validation |
| `reconstruct-metrics.yaml` | runtime | deterministic counts, unresolved/deferred counts, and pass rate |
| `stop-decision.yaml` | host LLM author | stop, continue, or ask-user decision based on metrics |
| `final-output.md` | host LLM author | user-facing result grounded in artifacts and provenance-checked by runtime |
| `reconstruct-run-manifest.yaml` | runtime | step refs, `performed_by` provenance, execution profile, and happy-path scope |
| `reconstruct-record.yaml` | runtime | primary structured reconstruct artifact |

Current deferred reconstruct artifacts are recorded in
`reconstruct-run-manifest.yaml` under `happy_path_scope.deferred_artifacts`:
`domain_context_selection` and `domain_context_selection_validation`. Those
require additional domain selection semantics and are outside the current
direct-call path.

The reconstruct design contract also defines validation artifacts for those
stages, stable reconstruct stage ids, cross-artifact id authority, and progress
UX expectations in `.onto/processes/reconstruct/reconstruct-execution-ux-contract.md`.
Seed discovery is further constrained by
`.onto/processes/reconstruct/top-level-concept-discovery-contract.md`, which
defines the Seed as a purpose-relative top-level concept discovery artifact
rather than a full ontology or broad claim ledger.

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
npm run test:e2e
git diff --check
```
