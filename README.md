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
happy-path runner. The runner classifies target material, writes source
observations, accepts pluggable LLM-owned directive authors and confirmation
providers, validates evidence refs, computes deterministic metrics, and writes
`final-output.md`, `reconstruct-run-manifest.yaml`, and the primary
`reconstruct-record.yaml`. Code is the first fixture; the runner path is shared
with spreadsheet/document/database material through source profiles and
material-specific observers. The current public run path is an explicit mock
semantic/confirmation post-Seed artifact loop. It implements claim realization,
confirmation validation, competency-question assessment, failure classification,
revision proposal, metrics/status projection, and artifact-tethered final
output; domain context selection remains deferred.
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
| `onto.review_status` | Read structured status and artifact refs |
| `onto.review_result` | Read `review-record.yaml` and final output |
| `onto.list_lenses` | List canonical lens sets |
| `onto.list_domains` | List available domain ids |
| `onto.list_source_profiles` | List reconstruct source profiles |
| `onto.observe_source` | Materialize reconstruct material profile, inventory, source observations, and initial record |
| `onto.validate_reconstruct_directive` | Validate LLM-authored reconstruct directive files |
| `onto.reconstruct` | Run the material-aware reconstruct post-Seed loop with explicit mock semantic/confirmation realization |
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
    "sessionRoot": ".onto/reconstruct/example-run",
    "semanticAuthorRealization": "mock",
    "confirmationProviderRealization": "mock"
  }
}
```

`semanticAuthorRealization` and `confirmationProviderRealization` are required
so completed reconstruct runs are explicit about their current mock semantics.
Today this proves the material-aware post-Seed artifact loop, runtime gates, and
MCP surface. It does not claim live host-LLM semantic authorship or live
user-mediated confirmation.

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

Implemented mock-authored, runtime-gated outputs:

| Artifact | Owner | Purpose |
|---|---|---|
| `target-material-profile.yaml` | runtime | detected `target_material_kind`, support status, and selected source profiles |
| `source-inventory.yaml` | runtime | material-specific inventory units and scan boundary |
| `source-observations.yaml` | runtime | structural observations with stable evidence ids |
| `source-observation-directive.yaml` | mock/host author | selected observations for evidence use |
| `source-observation-directive-validation.yaml` | runtime | validation of selected observation refs |
| `seed-candidate.yaml` | mock/host author | evidence-backed Seed candidate |
| `seed-candidate-validation.yaml` | runtime | Seed claim and evidence-ref validation |
| `claim-realization-map.yaml` | mock/host author | claim-level evidence stance |
| `claim-realization-map-validation.yaml` | runtime | claim id, stance enum, and evidence linkage validation |
| `seed-confirmation.yaml` | mock/host/user mediated | accepted, rejected, partial, or deferred Seed confirmation |
| `seed-confirmation-validation.yaml` | runtime | confirmation transition validation and derived claim sets |
| `competency-questions.yaml` | mock/host author | questions linked to confirmed claims |
| `competency-questions-validation.yaml` | runtime | CQ id, claim-link, and evidence validation |
| `competency-question-assessment.yaml` | mock/host author | answer status for every authoritative CQ |
| `competency-question-assessment-validation.yaml` | runtime | exactly-once CQ assessment validation |
| `failure-classification.yaml` | mock/host author | material failure and gap classification |
| `failure-classification-validation.yaml` | runtime | failure enum, linkage, and materiality validation |
| `revision-proposal.yaml` | mock/host author | bounded revision/deferral proposals |
| `revision-proposal-validation.yaml` | runtime | proposal id, target, action, and regression guard validation |
| `reconstruct-metrics.yaml` | runtime | deterministic counts, unresolved/deferred counts, and pass rate |
| `stop-decision.yaml` | mock/host author | stop, continue, or ask-user decision based on metrics |
| `final-output.md` | mock/host author | user-facing result grounded in artifacts and provenance-checked by runtime |
| `reconstruct-run-manifest.yaml` | runtime | step refs, `performed_by` provenance, execution profile, and happy-path scope |
| `reconstruct-record.yaml` | runtime | primary structured reconstruct artifact |

Current deferred reconstruct artifacts are recorded in
`reconstruct-run-manifest.yaml` under `happy_path_scope.deferred_artifacts`:
`domain_context_selection` and `domain_context_selection_validation`. Those
require additional domain selection semantics and are outside the current mock
path.

The post-Seed design contract also defines validation artifacts for those
stages, stable reconstruct stage ids, cross-artifact id authority, and progress
UX expectations in `.onto/processes/reconstruct/reconstruct-execution-ux-contract.md`.

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
