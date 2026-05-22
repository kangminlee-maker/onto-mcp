# Onto Review

Reviews `$ARGUMENTS` through the productized TypeScript review runtime.

The command surface is intentionally thin. Runtime truth lives in
`.onto/processes/review/*`, `.onto/authority/core-lens-registry.yaml`, and the
TypeScript core.

## Entrypoints

- `onto review <target> <intent>` — installed CLI
- `npm run review:invoke -- <target> "<intent>"` — repo-local path
- MCP tool: `onto.review`

## Canonical Runtime Path

1. `InvocationInterpretation` — LLM-owned intent and target interpretation.
2. User/domain confirmation when required.
3. `InvocationBinding` — runtime-owned concrete target/domain/session binding.
4. Execution preparation artifacts and prompt packets are materialized.
5. Review lenses run as context-isolated reasoning units.
6. Controlled lens deliberation writes `deliberation.md`.
7. `synthesize` consumes lens outputs plus `deliberation.md`.
8. Runtime assembles `review-record.yaml` and `final-output.md`.

## Configuration

```json
{
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
      "max_concurrent_workers": 6,
      "deliberation": "controlled-lens-deliberation"
    }
  },
  "llm": {
    "auth": "oauth",
    "provider": "openai",
    "model": "gpt-5.5",
    "effort": "medium",
    "service_tier": "fast"
  }
}
```

- `review.execution.mode`: `main-workers` or `nested-workers`.
- `review.execution.deliberation`: `controlled-lens-deliberation`.
- `review.execution.max_concurrent_workers`: optional positive worker cap.
- `llm.auth`: `oauth`, `api_key`, or `local`.
- `llm.provider`: `openai`, `anthropic`, `grok`, or `lmstudio`.

Invalid config stops execution during validation/materialization.

## Domain Selection

- `--domain {name}` selects one configured domain.
- `--no-domain` runs methodology-only review.
- If omitted, runtime uses the single configured domain or asks the user when
  multiple domains are available in an interactive session.
- Non-interactive multi-domain review requires an explicit `--domain` or
  `--no-domain`.

## Boundary Selection

If the target resolves outside `project-root`, runtime asks for an explicit
filesystem-boundary decision in TTY mode.

In non-interactive mode, rerun with one explicit decision:

- `--filesystem-boundary-decision approve --filesystem-allowed-root <external_root>`
- `--filesystem-boundary-decision rerun`
- `--filesystem-boundary-decision cancel`

## Required Process Contracts

Read the current repo copies of:

- `AGENTS.md`
- `.onto/processes/review/productized-live-path.md`
- `.onto/processes/review/nested-spawn-coordinator-contract.md`
- `.onto/processes/review/interpretation-contract.md`
- `.onto/processes/review/binding-contract.md`
- `.onto/processes/review/execution-preparation-artifacts.md`
- `.onto/processes/review/lens-prompt-contract.md`
- `.onto/processes/review/synthesize-prompt-contract.md`
- `.onto/processes/review/prompt-execution-runner-contract.md`
- `.onto/processes/review/record-contract.md`
- `.onto/processes/review/record-field-mapping.md`
- `.onto/processes/review/review.md`
